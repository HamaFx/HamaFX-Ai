# 15 — Production migration reconciliation

> This is an operator runbook for the single-user OSS deployment. The report
> command is read-only. Do not run the write steps until a verified backup,
> migration-history mapping, and explicit maintenance approval exist.

## Current audit result

The latest read-only production probe found:

### Historical audit (before the reset)

The original production audit found migration-history drift and several schema
repairs that could not safely be applied in place. Because the deployment was
approved for a clean rebuild, the application schemas were reset from a
verified backup and replayed from the repository migration chain.

### Current verified state

- Production migration table: **70 rows**, with no unknown hashes and no pending migrations.
- Repository migration journal/SQL files: **70/70**, internally hash-consistent.
- `public.chat_tool_telemetry.output_chars` is present.
- `public.alerts.delivery_claimed_at` and its index are present.
- `chat_threads_one_briefings_per_user_idx` is present.
- `public.telegram_updates` and its processed-at index are present.
- `symbol_catalog.twelve_data_symbol` has been removed.
- Duplicate briefing groups: **0**; the reset contains no chat threads or messages.
- RLS remains enabled and forced on the 22 tenant-protected tables.
- Supabase-managed schemas `auth`, `extensions`, `storage`, and `vault` were preserved.
- `anon` and `authenticated` have no direct public table/sequence privileges;
  `service_role` retains full access for server-side operations.
- The application uses server-side PostgreSQL access; this grant policy does
  not provide a browser/PostgREST table API.

The destructive reset was performed only after a verified backup. The reset
removed application data from `public` and recreated it through migrations;
Supabase-managed schemas were not reset.

## 1. Generate a fresh report

Use a direct/session connection. Do not source an env file containing values
with shell syntax; provide the URL through the process environment using the
operator's approved secret mechanism.

```bash
DIRECT_URL='…' pnpm --filter @kestrel/db migrate:reconcile
DIRECT_URL='…' pnpm --filter @kestrel/db migrate:reconcile -- --json
```

The command performs only `SELECT` queries and local migration-file reads. It
reports unknown hashes, local hashes absent remotely, duplicate briefing
threads, required columns/indexes, and the current role's RLS bypass status.

## 2. Freeze and back up

Before changing production:

1. Pause Vercel/worker deploys and cron writers.
2. Confirm the backup is recent and restorable.
3. Prefer a direct connection for the dump:

```bash
export DIRECT_URL='…'
pg_dump --format=custom --no-owner \
  --file=/secure/kestrel-pre-reconcile.dump "$DIRECT_URL"
pg_restore --list /secure/kestrel-pre-reconcile.dump \
  >/tmp/kestrel-pre-reconcile.contents
```

4. If the backup cannot be restored or listed, stop. Do not continue with
   duplicate cleanup or migrations.

## 3. Resolve migration-history drift

Do not edit an applied migration file. Do not run `drizzle-kit push`. Do not
insert guessed rows into `drizzle.__drizzle_migrations`.

For each unknown production hash:

1. Search deployment artifacts, release tags, and historical repository
   revisions for the exact SHA-256 of the migration SQL.
2. Record the mapping from production row ID/hash to the historical migration
   tag and commit.
3. Confirm whether the migration's schema effects are already present.
4. If a historical SQL file cannot be recovered, stop and make a new,
   forward-only repair migration after inspecting the live schema.

The repository predeploy and status gates intentionally refuse to migrate while
unknown hashes remain. Keep that behavior; it prevents a divergent migration
chain from being replayed blindly.

## 4. Inspect and reconcile duplicate briefing threads

Run this read-only query and save the result with the change record:

```sql
WITH duplicate_users AS (
  SELECT user_id
  FROM public.chat_threads
  WHERE is_briefings = true
  GROUP BY user_id
  HAVING count(*) > 1
)
SELECT
  t.user_id,
  t.id,
  t.created_at,
  t.updated_at,
  (SELECT count(*) FROM public.chat_messages m WHERE m.thread_id = t.id) AS message_count
FROM public.chat_threads t
JOIN duplicate_users d ON d.user_id = t.user_id
WHERE t.is_briefings = true
ORDER BY t.user_id, t.created_at, t.id;
```

The current evidence favors retaining the newer, 50-message thread and
removing the older zero-message duplicate. Verify that no other application
or external table references the old thread before making that decision.

Only after backup and approval, use a transaction with an exact ID obtained
from the inspection query. Never copy the placeholder below literally:

```sql
BEGIN;

SELECT id, user_id, is_briefings, created_at, updated_at
FROM public.chat_threads
WHERE id IN ('<canonical-thread-id>', '<duplicate-thread-id>')
FOR UPDATE;

-- Confirm the selected duplicate has zero messages and is not the canonical row.
SELECT count(*) AS duplicate_message_count
FROM public.chat_messages
WHERE thread_id = '<duplicate-thread-id>';

-- Approval-gated destructive step:
DELETE FROM public.chat_threads
WHERE id = '<duplicate-thread-id>'
  AND is_briefings = true;

COMMIT;
```

If the duplicate contains messages, do not delete it automatically. Create an
explicit message-rehoming plan, preserve message IDs where possible, and
obtain separate approval.

## 5. Apply the validated corrective migrations

Only after the history mapping and duplicate reconciliation are complete.
The current forward migrations are `0065` through `0070`:

```bash
DIRECT_URL='…' pnpm --filter @kestrel/db migrate:status
DIRECT_URL='…' pnpm --filter @kestrel/db migrate:apply
DIRECT_URL='…' pnpm --filter @kestrel/db migrate:reconcile
```

The migration chain should then install/remove:

- `chat_tool_telemetry.output_chars`
- `alerts.delivery_claimed_at`
- `alerts_delivery_claimed_at_idx`
- `chat_threads_one_briefings_per_user_idx`
- `telegram_updates` and `telegram_updates_processed_at_idx`
- the empty legacy `symbol_catalog.twelve_data_symbol` column

A failed preflight is safer than a partial migration. Stop and investigate any
error; do not bypass the guard with a force flag.

## 6. Post-migration verification

Run the reconciliation report again and verify:

- Unknown production hashes: `0`.
- Pending migrations: `0`.
- Duplicate briefing groups: `0`.
- Required tables and columns: present.
- Required indexes: present.
- `symbol_catalog.twelve_data_symbol` is absent.
- Migration status is clean.
- Application and worker logs show no migration/schema errors.
- Alert delivery claims work on the next scheduled alert evaluation.
- `anon` and `authenticated` do not have direct table/sequence privileges.
- `service_role` retains the privileges required by server-side operations.

Migrations `0069` and `0070` restore the permissions lost when `public` was
recreated, then remove broad direct API-role table and sequence privileges. They
are intentionally separate forward-only migrations because both have already
been applied in production; do not edit either file or rewrite migration
history. The application should continue using its server-side database role,
not direct browser access to public tables.

Keep the OSS deployment boundary explicit:

```env
MULTI_USER_ENABLED=0
KESTREL_ENABLE_RLS=0
REGISTRATION_MODE=owner-first
```

This procedure does not enable multi-tenant RLS. That requires a separate
architecture project, a non-bypass application role, complete tenant context
coverage, and PostgreSQL isolation tests.
