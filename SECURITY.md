# Security

## Reporting

If you find a security issue, do **not** open a public issue. Report privately
to the maintainers (see CONTRIBUTING.md) with the affected version and a
reproduction. We aim to acknowledge within 72 hours.

## Security model

- **Credentials live server-side only.** The RAG API key, session secrets and
  admin credentials exist in the dashboard process environment/state — never in
  browser JS, never in API responses.
- **Application-layer authentication:** scrypt password hashing, random
  session tokens stored hashed, `HttpOnly` + `SameSite=Strict` cookies.
  Anonymous users get 401; an admin role gates every console route.
- **CSRF protection:** every mutation requires the `X-CSRF-Token` header to
  match the `rd_csrf` cookie (double-submit), plus rate-limited login.
- **Audit trail:** append-only audit log (JSONL) records user, action,
  resource, result, correlation id, sanitized before/after and IP. It is
  read-only via the API and never editable.
- **Upload validation:** size caps, MIME sniffed from content, binary
  rejection, extension allowlist, sha256 checksum, duplicate detection,
  server-chosen storage names (never client paths).
- **No direct database access from the browser:** all RAG/Chroma interaction is
  proxied through the backend.
- **Response hardening:** strict CSP, `nosniff`, `X-Frame-Options: DENY`,
  referrer policy, permissions policy.

## Secrets that must never be committed

`.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`, `*.htpasswd`,
`.admin-password`, `*password*`, `*secret*`, backups, audit logs, session
files, user records, Chroma/vector data, uploaded production documents.

## Recommended production posture

- Run behind an authenticated reverse proxy; keep the app bound to
  `127.0.0.1`.
- Store `ADMIN_DATA_DIR` on an encrypted, backed-up volume.
- Rotate `RAG_API_KEY`, `SESSION_SECRET` and admin credentials before any
  production use.
- Enable Docker Security options in `docker-compose.example.yml`
  (non-root, `cap_drop: ALL`, `no-new-privileges`, read-only rootfs).