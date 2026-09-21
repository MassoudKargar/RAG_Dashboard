# RAG integration

The dashboard talks to the RAG service exclusively server-side over
`127.0.0.1:8000`, using the configured `RAG_API_KEY` (bearer/header). The key
never reaches the browser.

## Production ingestion

`POST /v1/vector_db/documents` (RAG service):

```json
{ "text": "...", "source": "file.txt", "metadata": { "document_id": "doc_x" } }
```

The RAG service runs its own production pipeline: deterministic chunking
(semantic boundaries, Persian/Arabic-aware), embedding (local GTE Persian or
configured provider), and ChromaDB upsert. Re-uploading the same
`document_id` replaces the previous chunks (idempotent, deterministic chunk
IDs like `<document_id>::chunk_00000`). The dashboard does **not** duplicate
this pipeline.

## Retrieval / chat

- `POST /v1/vector_db/search_documents` — `{prompt, limit}` → results with
  score (distance-based, lower = more similar), metadata, text.
- `POST /v1/chat/completions` — `{messages, model, stream}` → RAG-grounded
  chat.

## Internal admin endpoints (dashboard requirement)

The RAG service exposes these for the console; they reuse the RAG service's own
`rag_service`/`vector_store` code (no duplicated logic) and are protected by
the same `X-API-Key`:

- `GET /v1/vector_db/admin/collections`
- `GET /v1/vector_db/admin/stats`
- `GET /v1/vector_db/admin/documents` — paginated distinct documents
- `GET /v1/vector_db/admin/documents/{id}/chunks` — chunk inspector
- `DELETE /v1/vector_db/admin/documents/{id}` — delete ONLY one document's
  vectors (safe, metadata-filtered)

Source of truth for the required changes:
`integrations/rag-api/rag-admin-api.patch` (also see its README).

## Search null-handling fix

Chroma can return null/empty document rows for short or hyphenated queries.
The RAG service (`search_documents`) now normalizes results: invalid rows are
skipped while preserving index alignment, mixed results return the valid ones,
and an all-invalid response is HTTP 200 with an empty list (never a 502, never
the string `"None"`). Regression tests live in
`tests/test_search_normalization.py` in the RAG repository.

## Embedding service

When `EMBEDDING_PROVIDER=local`, embeddings are computed by a separate
microservice on `127.0.0.1:9010` (`POST /embed {"texts": [...]}`). The
dashboard treats it as a dependency of the RAG service (no direct calls).

## ChromaDB

ChromaDB persistence is owned by the RAG service. The dashboard never opens
ChromaDB directly; collection info arrives via the internal admin API.