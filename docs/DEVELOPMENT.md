# Development

See CONTRIBUTING.md for the loop and Definition of Done. This page covers the
structure details.

## Repo layout

```
frontend/   React + Vite SPA (src/features, src/admin, src/lib)
backend/    Node server (src/, src/adapters, src/admin)
tests/      unit (compare), backend (normalize/server/files), e2e (Playwright)
sample-data/ demo benchmark runs (marked as sample)
integrations/rag-api/ RAG service compatibility patch + README
docs/       architecture, deployment, configuration, API, security, ops
```

## Key invariants

- The RAG API key is read from env **only** by the backend process; nothing
  in `frontend/` or API responses contains it.
- Runtime state lives under `ADMIN_DATA_DIR` and is never served statically.
- `frontend/src/lib/*` and `backend/src/validation/*` are pure and unit
  tested — keep them dependency-free.
- Auditing is append-only; never add an edit/delete endpoint for audit.

## Adding an admin endpoint

1. Add the route in `backend/src/admin/api.ts` (session → CSRF → role checks →
   audit).
2. Add the matching client method in `frontend/src/admin/apiClient.ts`.
3. Add a backend test with a stubbed RAG client when the endpoint calls RAG.
4. Document it in `docs/API.md`.

## Tests

```bash
npm --prefix frontend run test:unit
npm --prefix backend run test:unit
# browser (needs Playwright browsers)
cd tests && npx playwright install chromium && npx playwright test
```

Integration tests against a real RAG service are marked and skipped when the
service is unavailable.