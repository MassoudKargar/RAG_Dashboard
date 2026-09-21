# Troubleshooting

- **Blank page after deploy** — check that static assets are served with
  `Content-Length` (the backend sets it for `/assets/*`). With some CDN setups,
  large chunked bodies are truncated; the repo splits assets + serves them
  cacheable, which avoids that path.
- **401 on /api/auth/me** — session missing/expired; log in again.
- **403 CSRF validation failed** — refresh the page (new CSRF cookie) and
  retry; ensure cookies are not blocked.
- **415 on upload** — unsupported type. Supported: TXT, Markdown, CSV, JSON,
  HTML. PDF/DOCX are rejected by design (no parser in the production RAG
  pipeline).
- **502 "RAG API …"** — the RAG service is unreachable at `RAG_API_URL`; check
  credentials (`RAG_API_KEY`) and that the internal admin endpoints exist
  (`integrations/rag-api/`).
- **Search returns empty for short queries** — the RAG service applies the
  null-result normalization fix; verify the RAG service is at least commit
  `83162e2` (or the patch applied). HTTP 200 + `[]` is expected behavior, not
  an error.
- **Login locked** — temporary (rate limit); wait out the window or (operator)
  clear `data/users/sessions.jsonl` and restart.
- **Logs** — the backend logs structured JSON to stdout; check
  `docker compose logs`.

## Health endpoints

- `GET /api/health` — dashboard reachable + data mode
- `GET /api/admin/health` — authenticated; probes configured services