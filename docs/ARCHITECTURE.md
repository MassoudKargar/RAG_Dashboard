# Architecture

## Diagram

```
Browser (React + Vite SPA)
        │  same-origin (no external fetches)
        ▼
Dashboard backend (Node 22, node:http, single process)
   ├─ GET/POST /api/…                      → session auth + admin role + CSRF
   ├─ /api/runs  (benchmark comparisons)   → read-only artifact files / API
   ├─ /api/admin/* (console)               → state store (volumes) + RAG client
   └─ static frontend (dist/ only)
        │  server-side calls, key held in process env
        ▼
RAG service (FastAPI, 127.0.0.1:8000)
   ├─ /v1/vector_db/documents      production ingestion (chunk→embed→index)
   ├─ /v1/vector_db/search_documents
   ├─ /v1/chat/completions
   ├─ /v1/vector_db/admin/*        internal admin API (list/chunks/delete)
   └─ ChromaDB persistent collection
        ▲
Local embedding service (127.0.0.1:9010) — GTE Persian embeddings
```

## Components in this repository

| Path | Purpose |
|---|---|
| `backend/src/server.ts` | HTTP server: static frontend, benchmark API, admin routes |
| `backend/src/config.ts` | typed configuration from env |
| `backend/src/admin/*` | auth (scrypt sessions + CSRF), audit, jobs, doc registry, RAG client, upload/text extraction |
| `frontend/src/` | React SPA: benchmarks view + administration console |
| `frontend/src/lib/*` | pure comparison/metrics/format logic (unit-tested) |
| `tests/` | unit, backend (stubbed upstream), e2e (Playwright) |

## Process & state boundaries

- The dashboard never talks directly to ChromaDB or the RAG service's database.
- All RAG communication happens server-side via HTTP to `127.0.0.1:8000`.
- Runtime state is kept in explicit persistent volumes and is *never* served
  to the browser:
  - `uploads/` — original source files (server-side names, sha256)
  - `docs/documents.jsonl` — document registry
  - `jobs/` — ingestion/maintenance job records
  - `users/` — admin user + sessions
  - `audit/audit.jsonl` — append-only audit log
  - `config/`, `prompts/`, `benchmarks/` — console-managed state

## Request lifecycle (admin)

1. Browser → `POST /api/auth/login` (public); session cookie `rd_session`
   (HttpOnly, SameSite=Strict) + CSRF cookie `rd_csrf`.
2. Every other request must carry a valid session; mutations must also carry
   the `X-CSRF-Token` header.
3. Role check `admin`; the action is recorded to the audit log.
4. Document upload: stream → validate (size/MIME/checksum) → persist original →
   call RAG ingestion → verify chunks → update registry + job + audit.