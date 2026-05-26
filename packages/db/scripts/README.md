# `packages/db/scripts/`

One-shot operational scripts for managing the live Supabase Postgres database.
Run from the repo root with `DATABASE_URL` (or `POSTGRES_URL`) set in env.

## `install-extensions.mjs`

Installs the required Postgres extensions (`pgcrypto`, `vector`) into the
`extensions` schema. Run **once** per project before the very first
`drizzle-kit migrate`. Idempotent — safe to re-run.

```bash
# Locally:
source apps/web/.env.production
pnpm --filter @hamafx/db migrate:setup-extensions
pnpm --filter @hamafx/db migrate:apply
```

Why a separate step? `CREATE EXTENSION` inside the same transaction as
`CREATE TABLE` doesn't expose the new types to subsequent statements, so we
install extensions in their own connection first.

## `db-check.mjs`

Read-only health check. Lists installed extensions, confirms `vector(N)` is
usable, prints `search_path`. Useful when something looks off.

## `list-tables.mjs`

Read-only. Prints all public tables and indexes — handy after a migration to
sanity-check that everything landed.
