# Changelog

All notable changes are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [0.1.0-alpha.1] — initial public release

### Added

- Benchmark comparison dashboard (quality/latency, primary vs. baseline,
  run history with search/filter).
- Administration console:
  - session login (admin role, scrypt, CSRF, rate limiting)
  - document management (list, text/file upload, chunk inspector,
    archive/restore, reindex/reprocess, typed-confirmation delete)
  - search playground + RAG chat query
  - collections overview, job records, masked configuration,
    append-only audit log, system health
- Files-mode benchmark adapter (read-only artifact dir, allowlist,
  anti-traversal, explicit latency units).
- RAG service integration: server-side API client, production ingestion
  reuse, internal admin API (list/chunks/delete) documented + shipped as a
  compatibility patch.
- Search null-result normalization (RAG-side fix, regression-tested).
- Docker multi-stage build (non-root, read-only rootfs, health check) and
  safe Compose examples.
- Unit/backend test suites; Playwright browser tests (available on demand).

### Notes

- alpha: several features remain incomplete (PDF/DOCX, URL ingestion, batch,
  background worker, full snapshot/restore/metadata versioning, prompt
  activation, config rollback, benchmark execution from UI). See README
  "Known limitations".
- License: not yet specified.

[Unreleased]: https://github.com/MassoudKargar/RAG_Dashboard