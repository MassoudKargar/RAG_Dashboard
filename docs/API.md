# API overview

Base URL: `/`. All JSON endpoints return UTF-8 JSON with
`X-Content-Type-Options: nosniff`.

## Authentication

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{username,password}` → sets session + CSRF cookies |
| POST | `/api/auth/logout` | clears session |
| GET | `/api/auth/me` | current session (401 when anonymous) |

`Authorization` is not used; cookies carry the session.
Mutations require header `X-CSRF-Token` matching the `rd_csrf` cookie.

## Benchmark (read-only)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | service + data-mode status |
| GET | `/api/runs` | normalized benchmark runs + meta |

## Administration console (admin role)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/overview` | aggregate status |
| GET | `/api/admin/health` | service checks |
| GET | `/api/admin/documents` | RAG list + registry |
| POST | `/api/admin/documents` | paste-text ingestion |
| POST | `/api/admin/upload` | multipart file upload (streaming) |
| GET | `/api/admin/documents/:id` | detail + chunks |
| GET | `/api/admin/documents/:id/chunks` | chunk inspector |
| POST | `/api/admin/documents/:id/archive|restore|reprocess|reindex` | actions |
| POST | `/api/admin/documents/:id/delete` | requires typed confirmation `{confirm:"DELETE <id>"}` |
| POST | `/api/admin/search` | `{prompt, limit}` → vector results + timing |
| POST | `/api/admin/rag-query` | `{messages, model}` → RAG chat |
| GET | `/api/admin/collections` | collection list (read-only) |
| GET | `/api/admin/jobs` | job records |
| POST | `/api/admin/jobs/:id/retry|cancel` | job controls |
| GET | `/api/admin/audit` | append-only audit log (paged) |
| GET | `/api/admin/config` | masked configuration names |
| POST | `/api/admin/config/test-connection` | connection checks |
| GET | `/api/admin/prompts` | prompt versions |

All admin routes require: valid session + `admin` role; mutations additionally
require the CSRF header.

## Error format

Non-2xx responses are JSON `{ "error": "message" }`.
401 = unauthenticated, 403 = CSRF/role failure, 415 = unsupported upload,
502 = upstream RAG failure.