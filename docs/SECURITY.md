# Security

See the repository-root [SECURITY.md](../SECURITY.md) for the security model,
reporting procedure and secrets policy.

Quick summary for this repository:

- Credentials live server-side only (RAG API key, session secret, admin
  credentials) — never in the browser bundle or API responses.
- Application-layer auth: scrypt password hashing, hashed random session
  tokens, HttpOnly + SameSite=Strict cookies, admin role on every console
  route.
- CSRF: double-submit token (`rd_csrf` cookie ↔ `X-CSRF-Token` header) on all
  mutations; login rate limiting.
- Audit: append-only JSONL, read-only API, never editable.
- Uploads: size caps, MIME sniffing from content, binary rejection, checksum,
  duplicate detection, server-chosen storage names.
- No direct browser→database/Chroma access (everything proxied server-side).
- Never commit: `.env*`, `*.pem/key/htpasswd`, `.admin-password`,
  `*password*`, `*secret*`, data/uploads/logs/backups, audit/session/user
  files, vector data.

## Public-deployment checklist

- Bind `127.0.0.1`; put an authenticated reverse proxy in front.
- Change `SESSION_SECRET`, `RAG_API_KEY`, and admin credentials.
- Persist `ADMIN_DATA_DIR` on an encrypted, backed-up volume.
- Use the Docker security defaults (non-root, `cap_drop: ALL`,
  `no-new-privileges`, read-only rootfs).