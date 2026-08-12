# Agent Setup and Run Guide

## Local development

```bash
pnpm install
pnpm dev:local
```

PGlite provides an embedded development database. Development auth, cron, and encryption secrets are generated and persisted under `.kestrel/dev-secrets.json`.

## Docker self-hosting

```bash
./docker/init-secrets.sh
docker compose up -d
```

The generated `.env` must be preserved. In particular, do not regenerate or lose `ENCRYPTION_SECRET` when BYOK credentials are stored.

## Common failures

- Production secret validation: set `AUTH_SECRET`, `CRON_SECRET`, and `ENCRYPTION_SECRET`.
- Multi-user startup refusal: shared mode is intentionally disabled; keep `MULTI_USER_ENABLED=0` and `KESTREL_ENABLE_RLS=0`.
- Migration failure: provide a direct/session PostgreSQL URL and inspect the app container logs.
- No AI key: add a provider key through onboarding or Settings → API Keys.
- Public deployment: place the app behind a TLS reverse proxy; the Compose loopback bindings are not a substitute for TLS.

Run `pnpm typecheck`, `pnpm lint`, and `pnpm turbo run test -- --run` before opening a pull request.
