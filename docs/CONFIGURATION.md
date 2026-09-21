# Configuration

All configuration is environment-based. See `.env.example` for the full,
documented list.

## Server

- `DASHBOARD_HOST` (default `127.0.0.1`) — bind address
- `DASHBOARD_PORT` (default `4173`)

## Authentication

- `SESSION_SECRET` — long random secret; used for session integrity. **Required
  for safe deployments.**
- `SESSION_TTL_MINUTES` (default `480`)
- `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_MINUTES` — login rate limiting
- `ADMIN_USERNAME` + bootstrap password (first boot; see SECURITY.md)

## RAG integration

- `RAG_API_URL` (default `http://127.0.0.1:8000`)
- `RAG_API_AUTH_MODE` — `none` | `bearer` | `header`
- `RAG_API_KEY` — server-side credential; never exposed to the browser

## Benchmark data

- `RAG_BENCHMARK_DATA_MODE` — `files` | `api` | `demo`
- `RAG_BENCHMARK_RESULTS_DIR` / `RAG_BENCHMARK_RESULTS_FILES` /
  `RAG_BENCHMARK_RESULTS_LATENCY_UNITS` — files mode
- `RAG_BENCHMARK_API_*` — api mode (upstream benchmark endpoint)
- `ENABLE_DEMO_MODE` — bundled sample data, clearly badged

## Upload limits

- `UPLOAD_MAX_BYTES` (default 10 MB), `UPLOAD_MAX_BATCH` (5),
  `UPLOAD_MAX_TEXT` (2 MB extracted text)

## Storage

- `ADMIN_DATA_DIR` — persistent state root (uploads, registry, jobs, audit,
  users). Point this at a durable volume.

## Logging

- `LOG_LEVEL` — `info` | `warn` | `error`

## Secrets policy

- Never store real values in `.env.example`, docs, tests, or the public repo.
- Never print token/session values in logs; the audit log stores sanitized
  before/after summaries only.