# RAG Dashboard

Private, responsive dashboard for a production RAG system: benchmark
comparison, administration console, document ingestion/management, chunk
inspection, a search playground, job records, collections overview, and an
append-only audit log.

**Maturity status:** alpha. The core path is implemented and tested
(authentication, audit logging, production text upload, document management,
search inspection, rollback guidance). Several advanced features are
incomplete — see [Known limitations](#known-limitations). Do not describe this
project as production-ready without reviewing those gaps.

---

## Features

- **Benchmark comparison** — quality/latency metrics, primary vs. baseline runs,
  correct direction-aware deltas, run history with search/filters.
- **Administration console** — session-based login (admin role),
  CSRF-protected mutations, rate-limited login.
- **Document management** — list, inspect, text/file upload, chunk inspector,
  archive/restore, reindex/reprocess, typed-confirmation permanent delete
  (vectors removed), checksum duplicate detection.
- **Search playground** — real vector retrieval with scores, metadata, stage and
  timing; RAG chat query.
- **Collections overview** (read-only list), **ingestion job records**
  (list + retry/cancel), **configuration** (masked names + test-connection),
  **audit log** (append-only), **system health**.
- **Security model** — server-side API credentials only, strict CSP, CSRF,
  rate limits, append-only audit, typed confirmations, no secrets in the
  browser bundle.

## Architecture overview

```
Browser
  └─ dashboard backend (Node, same-origin; session auth + admin role)
       ├─ benchmark runs: read-only artifact files (or configured API)
       └─ RAG Administration:
            ├─ documents / search / chat  → RAG service public API (localhost)
            ├─ internal RAG admin API     → RAG service (list/chunks/delete)
            └─ state store                 → persistent volumes
                                              (uploads, registry, jobs,
                                               audit, users — never served)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/RAG_INTEGRATION.md](docs/RAG_INTEGRATION.md).

## Technology stack

- Frontend: React 18 + TypeScript + Vite
- Backend: Node.js 22 (no runtime framework; `node:http`)
- Storage: persistent server-side volumes (JSONL state), ChromaDB lives inside
  the RAG service
- Tests: Vitest (unit/backend), Playwright (browser, optional)
- Packaging: Docker (multi-stage, non-root, read-only rootfs), Docker Compose

## Requirements

- Node.js 22+ and npm (local dev) or Docker + Docker Compose
- A running RAG service (FastAPI) on `127.0.0.1:8000` with the internal admin
  endpoints applied (see `integrations/rag-api/`)
- Local embedding service on `127.0.0.1:9010` when `EMBEDDING_PROVIDER=local`

## Quick start (demo mode)

```bash
git clone <repo-url> RAG_Dashboard
cd RAG_Dashboard

cp .env.example .env          # placeholders; demo mode is enabled by default
npm run install:all           # install frontend + backend deps

npm --prefix backend run build
npm --prefix frontend run build
DASHBOARD_PORT=4173 ENABLE_DEMO_MODE=true node backend/dist/server.js
# open http://127.0.0.1:4173   (login: admin / see data/.admin-password note)
```

## Docker usage

```bash
# Public-safe example: binds 127.0.0.1:4173, non-root, read-only rootfs
docker compose -f docker-compose.example.yml up -d --build
curl http://127.0.0.1:4173/api/health
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and
[docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Authentication model

Two layers: (1) optional edge authentication (e.g. nginx Basic Auth) and
(2) application-level session login with an **admin role**. All `POST/PUT/
DELETE` routes require the CSRF header. See [docs/SECURITY.md](docs/SECURITY.md).

## Upload / ingestion workflow

1. Upload a text file (TXT / Markdown / CSV / JSON / HTML) or paste text.
2. Server-side validation: size, MIME sniffing from content, binary reject,
   checksum, duplicate detection.
3. The production RAG service is called with the extracted text; the RAG
   service runs its own chunker → embedding → ChromaDB indexing (no duplicated
   pipeline in the dashboard).
4. Verification reads back the created chunks; failed jobs mark rollback.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- [docs/API.md](docs/API.md)
- [docs/RAG_INTEGRATION.md](docs/RAG_INTEGRATION.md)
- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/BACKUP_AND_ROLLBACK.md](docs/BACKUP_AND_ROLLBACK.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Known limitations

Honestly stated — these are **incomplete or unavailable** in this release:

- PDF and DOCX ingestion: **not supported** (rejected with a clear error — the
  production RAG pipeline has no parser library).
- URL ingestion, batch upload, drag-and-drop: **not available**.
- Background worker queue: **not implemented** — ingestion runs synchronously
  inside the request (job records are still kept).
- Complete snapshot/restore and metadata versioning with optimistic
  concurrency: **not implemented**.
- Prompt activation, configuration rollback: **not available** through the UI.
- Benchmark execution from the UI: **not available** (existing runs are shown
  and compared; running harness-style benchmarks belongs to the RAG repo).
- The RAG service may return an empty result set for very short or hyphenated
  queries (handled safely in this release: HTTP 200 with empty results; the
  RAG-service update included in this repository fixes the underlying
  `SearchResult.text=None` failure).

## License

License: Not yet specified.

Public source without a license does not grant normal reuse rights. See
[CHANGELOG.md](CHANGELOG.md) and [CONTRIBUTING.md](CONTRIBUTING.md).