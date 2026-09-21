# Backup and rollback

## What to back up

- `ADMIN_DATA_DIR` (uploads/, docs/, jobs/, users/, config/, prompts/,
  benchmarks/, audit/) — the console's state.
- `.env` — configuration (contains credentials; keep outside the repo).
- The RAG service ChromaDB volume and its `.env` (operated by the RAG service).

## Before making changes

Record the current commit and tag:

```bash
git rev-parse HEAD
git add -A && git commit -m "checkpoint"
git tag pre-change
cp .env .env.bak
docker compose ps
```

Copy the state volume (example with the compose project):

```bash
docker compose cp rag-benchmark-dashboard:/app/data ./data-backup
```

## Rollback (application)

```bash
cd /opt/rag-dashboard   # your deployment checkout
git checkout <previous-tag>
cp .env.bak .env
docker compose up -d --build
# verify
curl http://127.0.0.1:4173/api/health
```

## Rollback (RAG service changes)

The RAG service has its own repository. Its previous commit is recoverable via
that repository's history; the dashboard documentation records the minimum
compatible RAG commit (`83162e2`). If the RAG service was updated for the
internal admin API and you must revert, revert **only** the RAG-side commit and
restart the service; the dashboard keeps working for benchmark/search but
console list/chunks/delete will report 502 until restored.

## Rollback (state)

Restore the state backup, then restart the dashboard container. Audit records
are append-only; restoring an older audit file intentionally loses later
entries (documented limitation).

## Data deletion care

Permanent document deletion is destructive: it removes vectors from ChromaDB
and cannot be undone contractually. The console requires a typed confirmation
(`DELETE <document_id>`) before executing, and the operation is audited.