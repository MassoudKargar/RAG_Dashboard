# Contributing

Thanks for considering a contribution.

## Development loop

```bash
npm run install:all
npm --prefix backend run dev      # backend on :4173 (demo mode)
npm --prefix frontend run dev     # Vite on :5173, /api proxied to :4173
```

## Definition of done

- `npm --prefix frontend run typecheck` and `npm --prefix backend run typecheck`
  pass.
- `npm --prefix frontend run test:unit` and `npm --prefix backend run test:unit`
  pass (unit/backend suites; browser tests run in CI where a browser is
  available).
- `npm --prefix frontend run build` and `npm --prefix backend run build` pass.
- New behavior includes tests; pure logic goes into `frontend/src/lib/` with
  unit tests in `tests/unit/`.
- No secrets, runtime state, `.env` data, or production files are referenced by
  tests or documentation.
- Changelog entry added.

## Tests that need a live RAG service

Tests that call the real RAG/embedding services are **integration tests**: they
must be skipped (with an explicit reason) when those services are unavailable —
they are never silently reported as passed.

## Commits

Small, focused commits; descriptive messages; never include `.env`/data/log
files.

## Security

See SECURITY.md. Report privately; do not file public issues with exploit
details.

## License

License: Not yet specified (see README). By contributing you agree your
contribution can be used under the repository's final license once chosen.