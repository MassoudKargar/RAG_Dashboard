# Deployment

## Local

```bash
npm run install:all
npm --prefix backend run build
npm --prefix frontend run build
cp .env.example .env          # fill placeholders for your environment
DASHBOARD_HOST=127.0.0.1 DASHBOARD_PORT=4173 node backend/dist/server.js
```

## Docker (public-safe example)

`docker-compose.example.yml` provides a safe baseline: binds `127.0.0.1:4173`,
runs as a non-root user, drops all capabilities, `no-new-privileges`, read-only
rootfs with explicit writable volumes, health check, log rotation.

```bash
docker compose -f docker-compose.example.yml up -d --build
curl http://127.0.0.1:4173/api/health
```

`docker-compose.production.example.yml` documents a topology where the
dashboard must reach a RAG service that binds host-local ports
(`127.0.0.1:8000` RAG API, `127.0.0.1:9010` embeddings) — e.g. with host
networking — with an explicit warning that host networking must only be used
on trusted hosts and never as a blind default.

## Prerequisites

- Node 22+ or Docker 24+
- RAG service reachable at the configured `RAG_API_URL` with the internal
  admin endpoints applied (`integrations/rag-api/`).
- Owned persistent volume for `ADMIN_DATA_DIR` (uploads/registry/jobs/audit).

## Health checks

- `GET /api/health` — dashboard + configured service probes
- `GET /api/admin/health` — authenticated admin health (services)

## Reverse proxy notes

- The app is designed to sit behind an authenticated reverse proxy; the
  console login is the application-level enforcement point.
- Keep `X-Forwarded-Proto` correct so session cookies get the `Secure` flag.