# RAG service integration

This dashboard drives the RAG service through its **existing public API**
(`/v1/vector_db/*`, `/v1/chat/completions`, `/v1/health`) plus a small set of
**internal administration endpoints** that were added to the RAG service itself.

The internal endpoints are required for document listing, chunk inspection and
targeted single-document deletion from the dashboard:

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/vector_db/admin/collections` | GET | list collections (read-only) |
| `/v1/vector_db/admin/stats` | GET | aggregate collection stats |
| `/v1/vector_db/admin/documents` | GET | paginated distinct document list |
| `/v1/vector_db/admin/documents/{id}/chunks` | GET | chunk inspector |
| `/v1/vector_db/admin/documents/{id}` | DELETE | delete ONLY one document's vectors |

These routes call the RAG service's own `rag_service`/`vector_store` code; they
do not duplicate the ingestion pipeline. They are protected by the same
server-side `X-API-Key` header.

## Applying the patch

The RAG service lives in its own Git repository (`/var/rag_app` equivalent). If
you cannot pull the updated repository, apply the sanitized compatibility patch:

```bash
# From the RAG service repository root:
git apply /path/to/rag-admin-api.patch
systemctl restart rag-api.service   # re-read the new routes
```

Then verify: `curl -H "X-API-Key: ..." http://127.0.0.1:8000/v1/health`

The patch contains only the integration changes (admin routes + search-result
null-handling fix). It contains no secrets, no production paths and no runtime
data. It is a **temporary compatibility mechanism** until the RAG repository
update is deployed. Prefer pulling the RAG repository update over applying the
patch.

Minimum compatible RAG service: commit `83162e2` of the RAG repository
(contains `feat: add authenticated internal RAG admin endpoints` and
`fix: safely handle empty Chroma search documents`).