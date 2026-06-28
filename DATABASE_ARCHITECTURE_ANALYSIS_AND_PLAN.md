# HamaFX-Ai — Database Architecture Deep Analysis & Remediation Plan

> **Purpose:** This document is a complete, line-by-line audit of the `@hamafx/db` package and all database-related infrastructure in the HamaFX-Ai monorepo. It is written for the implementing agent who will execute the fixes. Every finding is categorized by severity, includes the exact file and line references, and provides concrete remediation steps.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Critical Errors & Bugs](#2-critical-errors--bugs)
3. [Schema Design Flaws](#3-schema-design-flaws)
4. [Migration System Issues](#4-migration-system-issues)
5. [Indexing Gaps & Performance](#5-indexing-gaps--performance)
6. [Security Concerns](#6-security-concerns)
7. [Data Integrity & Constraint Issues](#7-data-integrity--constraint-issues)
8. [Connection Pool & Client Issues](#8-connection-pool--client-issues)
9. [Testing Gaps](#9-testing-gaps)
10. [Code Quality & Consistency](#10-code-quality--consistency)
11. [Improvements & Upgrades](#11-improvements--upgrades)
12. [Polish & Cleanup](#12-polish--cleanup)
13. [Execution Plan (Ordered Tasks)](#13-execution-plan-ordered-tasks)

---

## 1. Architecture Overview

### Stack
- **ORM:** Drizzle ORM v0.38.3 with `drizzle-kit` v0.30.1
- **Database:** PostgreSQL 16 (via Supabase in prod, `pgvector/pgvector:pg16` in Docker, PGlite in local dev)
- **Driver:** `postgres` (postgres-js) v3.4.5 for prod, `@electric-sql/pglite` v0.5.3 for local dev
- **Extensions:** `pgvector` (1536-dim embeddings for news + memory), `pgcrypto`

### Schema Layout (27 tables across 22 schema files)

| Domain | Tables | Schema File |
|--------|--------|-------------|
| Auth (NextAuth v5) | `user`, `account`, `session`, `verificationToken`, `user_settings`, `user_symbols`, `user_sessions` | `auth.ts` |
| Chat | `chat_threads`, `chat_messages` | `chat.ts` |
| AI Telemetry | `chat_telemetry`, `chat_tool_telemetry` | `telemetry.ts`, `tool-telemetry.ts` |
| Agent Opinions | `agent_opinions` | `agent-opinions.ts` |
| Alerts | `alerts` | `alerts.ts` |
| Journal | `journal_entries` | `journal.ts` |
| News & Embeddings | `news_articles`, `news_embeddings` | `news.ts` |
| Calendar | `economic_events` | `calendar.ts` |
| Briefings | `briefings_emitted` | `briefings.ts` |
| COT Reports | `cot_reports` | `cot.ts` |
| Share | `shared_snapshots` | `share.ts` |
| Push | `push_subscriptions` | `push.ts` |
| Memory | `memory_embeddings` | `memory.ts` |
| Spend Tracking | `daily_ai_spend` | `daily-ai-spend.ts` |
| Rate Limiting | `rate_limits` | `rate-limits.ts` |
| Market Data | `live_ticks`, `candles_1m` | `live-ticks.ts`, `candles-1m.ts` |
| Throttle | `provider_throttle` | `throttle.ts` |
| Intermarket | `intermarket_resonance` | `intermarket-resonance.ts` |
| Audit | `audit_logs` | `audit.ts` |
| Provider Tests | `provider_tests` | `provider-tests.ts` |
| Symbol Catalog | `symbol_catalog` | `symbol-catalog.ts` |
| Cron Idempotency | `cron_runs` | `cron-runs.ts` |
| Decision Signals | `decision_signals`, `decision_signal_outcomes`, `decision_signal_feedback` | `decision-signals.ts` |
| Portfolio | `portfolio_positions`, `portfolio_settings` | `portfolio.ts` |
| Noise Control | `notification_noise_state` | `noise-control.ts` |
| Bot Links | `bot_links` | `bot-links.ts` |

### Migration History
- 27 migrations (0000–0026), spanning single-user → multi-user → multi-agent → decision signals
- Migration 0009 is the pivotal multi-user transition (adds `user_id` to 10 tables with `'__system__'` default)
- Later migrations (0015+) use `IF NOT EXISTS` guards — earlier ones do not

---

## 2. Critical Errors & Bugs

### CRITICAL-1: `drizzle.config.ts` references `postgis` extension that is never used

**File:** `packages/db/drizzle.config.ts` (line ~40)
**Code:** `extensionsFilters: ['postgis']`

The project uses `pgvector`, not PostGIS. The `extensionsFilters` field tells drizzle-kit to filter out PostGIS-related schema objects during introspection. This is either a copy-paste error or a leftover from a removed feature. It should be `['vector']` or removed entirely (the `vector` extension is already handled via the hand-written migration in `0000`).

**Fix:** Change to `extensionsFilters: ['vector']` or remove the line.

---

### CRITICAL-2: `migrate-v2.ts` references non-existent schema exports

**File:** `packages/db/scripts/migrate-v2.ts` (lines ~60–72)

The script references `schema.briefings`, `schema.journal`, `schema.memory`, `schema.shareLinks`, `schema.telemetryTraces`, `schema.toolTelemetry` — none of which exist in the current schema barrel. The actual export names are `briefingsEmitted`, `journalEntries`, `memoryEmbeddings`, `sharedSnapshots`, `chatTelemetry`, `chatToolTelemetry`. Running this script today would throw immediately.

**Fix:** Update all table references to match the actual exported names from `schema/index.ts`, or delete the script if the migration has already been completed on all deployments.

---

### CRITICAL-3: `briefings_emitted` has double `.notNull()` on `userId`

**File:** `packages/db/src/schema/briefings.ts` (line ~33)
**Code:**
```ts
userId: text('user_id').notNull()
  .notNull()
  .references(() => users.id, { onDelete: 'cascade' }),
```

The `.notNull()` is chained twice. While Drizzle may silently ignore the duplicate, this is a code smell that indicates a copy-paste error during the multi-user migration. It should be a single `.notNull()`.

**Fix:** Remove the duplicate `.notNull()`.

---

### CRITICAL-4: `daily_ai_spend` has the same double `.notNull()` on `userId`

**File:** `packages/db/src/schema/daily-ai-spend.ts` (line ~33)
**Code:**
```ts
userId: text('user_id').notNull()
  .notNull()
  .references(() => users.id, { onDelete: 'cascade' }),
```

Same issue as CRITICAL-3.

**Fix:** Remove the duplicate `.notNull()`.

---

### CRITICAL-5: `rate_limits` table has no foreign key on `user_id`

**File:** `packages/db/src/schema/rate-limits.ts`

The `rate_limits` table defines `userId: text('user_id').notNull()` with no `.references()` call. In migration `0015_open_komodo.sql`, the FK was explicitly dropped:
```sql
ALTER TABLE "rate_limits" DROP CONSTRAINT IF EXISTS "rate_limits_user_id_user_id_fk";
```

This means rate limit rows for deleted users become orphaned forever. The `ON DELETE CASCADE` is missing, so deleted users' rate limit rows accumulate indefinitely.

**Fix:** Re-add the FK reference: `.references(() => users.id, { onDelete: 'cascade' })` in the schema, and create a migration to add the FK constraint back. The drop in 0015 was likely done because the `rate_limits` table was created in the same migration (0009) with a FK, and the drop was to avoid a conflict during the multi-user transition. It should be restored.

---

### CRITICAL-6: `provider_tests` uses `index()` instead of `primaryKey()` for the composite key

**File:** `packages/db/src/schema/provider-tests.ts` (lines ~40–42)
**Code:**
```ts
(t) => ({
  pk: index('provider_tests_user_provider_idx').on(t.userId, t.providerId),
}),
```

The comment says "We store ONE row per (user, provider) using a composite primary key" but the code creates a regular index, not a primary key. This means:
1. Duplicate rows for the same (user_id, provider_id) can be inserted
2. The upsert in `/api/settings/test-provider` relies on `ON CONFLICT` which requires a unique constraint or PK — without it, the upsert will fail or insert duplicates

**Fix:** Change `index(...)` to `primaryKey({ columns: [t.userId, t.providerId] })` and create a migration to add the PK constraint. If existing duplicate rows exist, deduplicate first.

---

### CRITICAL-7: `docker-entrypoint.sh` silently swallows migration failures

**File:** `apps/web/docker-entrypoint.sh` (line ~22)
**Code:**
```sh
npx drizzle-kit migrate --config packages/db/drizzle.config.ts 2>/dev/null || \
  echo "Warning: migration step skipped (drizzle-kit may not be available)"
```

Redirecting stderr to `/dev/null` and continuing on failure means the app starts with a stale or broken schema. This is extremely dangerous in production — the app will appear to boot but crash on any DB query that touches a new table/column.

**Fix:** Remove `2>/dev/null`, and make the migration failure fatal:
```sh
npx drizzle-kit migrate --config packages/db/drizzle.config.ts || { echo "FATAL: migrations failed"; exit 1; }
```

---

## 3. Schema Design Flaws

### FLAW-1: `user_settings` is a "god table" with 30+ columns

**File:** `packages/db/src/schema/auth.ts` (userSettings definition)

The `user_settings` table has accumulated 30+ columns across 12+ migrations. It mixes:
- Trading preferences (`defaultSymbol`, `marketDataProvider`)
- AI model config (`chatModel`, `visionModel`, `embeddingModel`, `defaultModels`, `agentModelOverrides`, `aiFallbackChain`)
- Budget config (`maxDailyUsd`, `monthlyBudgetLimit`, `providerSpendingThresholds`, `spendAlertsConfig`, `spendAlertsState`)
- Notification config (`notificationPreferences`, `spendAlertsConfig`)
- Auth/security (`telegramBotToken`, `telegramChatId`, `alertEmail`, `aiApiKeys`)
- UI prefs (`theme`, `timeFormat`, `reduceMotion`, `language`)
- Feature flags (`disabledTools`, `onboardingCompleted`, `showAgentOpinions`, `defaultAnalysisMode`)

This makes the table hard to reason about, causes wide row scans, and means any settings update writes the entire row.

**Recommendation:** Split into focused tables:
- `user_preferences` (UI/theme/language/timezone)
- `user_ai_config` (models, fallback chains, agent overrides)
- `user_budget_config` (limits, thresholds, alerts)
- `user_notification_config` (channels, preferences)
- `user_credentials` (encrypted API keys, telegram tokens)

This is a medium-priority refactor — not urgent but should be planned.

---

### FLAW-2: Inconsistent column naming conventions

The schema mixes `camelCase` and `snake_case` column names inconsistently:

- **NextAuth tables** use camelCase DB columns: `emailVerified`, `hashedPassword`, `tokenVersion`, `twoFactorSecret`, `twoFactorEnabled`, `providerAccountId`, `refresh_token`, `access_token`
- **Application tables** use snake_case: `user_id`, `created_at`, `thread_id`, `message_id`
- **Some NextAuth columns** are snake_case: `refresh_token`, `access_token`, `session_state`, `id_token`

This is because the NextAuth adapter expects specific column names. While this is unavoidable for the NextAuth tables, the inconsistency extends to the `user_settings` table which uses snake_case for some columns (`default_symbol`, `telegram_bot_token`) but camelCase for the JS property names.

**Recommendation:** Document the convention explicitly. NextAuth tables follow the adapter's naming; all application tables use snake_case DB columns with camelCase TS property names via Drizzle's `text('snake_case')` pattern. This is already mostly followed but should be documented.

---

### FLAW-3: No enum types — everything is `text`

Every status/role/type field is stored as `text` instead of Postgres enums:
- `user.role` → text (should be enum: `user`, `admin`)
- `alerts.channels` → text array
- `chat_threads.analysisMode` → text (should be enum: `single`, `quick`, `standard`, `full`, `auto`)
- `decision_signals.action` → text (should be enum: `buy`, `sell`, `hold`, `reduce`, `add`, `avoid`)
- `decision_signals.status` → text (should be enum: `active`, `expired`, `invalidated`, `closed`)
- `journal_entries.outcome` → text (should be enum: `win`, `loss`, `breakeven`, `open`)
- `cron_runs.status` → text with enum constraint (this one does use `{ enum: [...] }`)
- `portfolio_positions.status` → text (should be enum: `open`, `closed`)

Using `text` instead of enums means:
1. No database-level validation of allowed values
2. Invalid values can be inserted (e.g., `status = 'pening'` typo)
3. No referential integrity for status transitions

**Recommendation:** Define Postgres enums for fields with fixed value sets. Drizzle supports `pgEnum`. This is a medium-priority improvement.

---

### FLAW-4: `snapshots` table has no unique constraint on `(symbol, kind, as_of)`

**File:** `packages/db/src/schema/snapshots.ts`

The snapshots table stores daily/weekly/monthly snapshots but has no unique constraint on `(symbol, kind, as_of)`. This means the cron job can insert duplicate snapshots for the same period if it runs twice (e.g., during a deploy overlap). The `cron_runs` idempotency guard helps but doesn't fully prevent it if the cron succeeds at inserting snapshots but fails before recording the cron run.

**Fix:** Add a unique index on `(symbol, kind, as_of)` and use `ON CONFLICT DO UPDATE` in the insert path.

---

### FLAW-5: `economic_events` has no unique constraint on `(id)` beyond the PK — but `id` is provider-prefixed, making it fragile

**File:** `packages/db/src/schema/calendar.ts`

The `id` is constructed as `"<source>:<native_id>"` (e.g., `"te:1234567"`). This is a good pattern, but there's no validation that the source prefix is present. A malformed insert with `id = "1234567"` (no prefix) would succeed and could collide with a future provider that uses the same numeric ID.

**Recommendation:** Add a CHECK constraint requiring the `id` to contain a colon: `CHECK (id LIKE '%:%')`. Alternatively, use a composite PK of `(source, native_id)`.

---

### FLAW-6: `chat_messages` has no `user_id` column — authorization requires a JOIN

**File:** `packages/db/src/schema/chat.ts`

`chat_messages` references `chat_threads` via `thread_id`, and `chat_threads` has `user_id`. To authorize a message read, you must JOIN through `chat_threads`. This is correct for normalization but means every message query pays for the JOIN. For a chat app where message reads are frequent, this adds up.

**Recommendation:** This is an acceptable trade-off for normalization. Document the authorization pattern and ensure all message queries go through a helper that enforces the user scope. Do NOT denormalize `user_id` onto `chat_messages` — it would introduce a consistency risk.

---

### FLAW-7: `memory_embeddings` unique constraint on `(kind, source_id)` doesn't include `user_id`

**File:** `packages/db/src/schema/memory.ts`

The unique constraint is `unique('memory_embeddings_kind_source_uk').on(t.kind, t.sourceId)`. But in a multi-user system, two users could have memory entries with the same `kind` and `source_id` (e.g., both have a `thread_synopsis` for the same thread ID — unlikely but possible if thread IDs are ever reused or if `source_id` is not globally unique).

More importantly, the `ON CONFLICT (kind, source_id) DO UPDATE` upsert path mentioned in the comment would cross user boundaries — user A's memory could be overwritten by user B's insert if they happen to share the same `(kind, source_id)`.

**Fix:** Change the unique constraint to `(user_id, kind, source_id)` to scope it per user. Create a migration to drop the old constraint and add the new one.

---

## 4. Migration System Issues

### MIG-1: No `meta/*.json` snapshot files — drizzle-kit introspection is broken

**File:** `packages/db/drizzle/meta/`

The `meta/` directory contains only `_journal.json` — no snapshot files. Drizzle-kit normally creates a `0000_snapshot.json`, `0001_snapshot.json`, etc. for each migration. Without these, `drizzle-kit generate` cannot diff against the previous state and will generate migrations that re-create existing tables.

This is likely why `run_drizzle.py` exists — to auto-accept the "created or renamed from another table?" prompts that drizzle-kit asks when it can't find snapshots.

**Fix:** Run `drizzle-kit generate` with `--custom` for future migrations, or regenerate snapshots by running `drizzle-kit introspect` against a fully-migrated database. This is a high-priority fix for developer experience.

---

### MIG-2: `run_drizzle.py` is a fragile pexpect wrapper

**File:** `packages/db/run_drizzle.py`

This script auto-accepts drizzle-kit's interactive prompts via `pexpect`. It sends `\r` (Enter) to any "created or renamed from another table?" prompt, which means it always accepts the default — potentially creating incorrect migrations.

**Fix:** Remove this script once MIG-1 is fixed (snapshots restored). If interactive prompts are still needed, use `drizzle-kit generate --custom` and write migrations by hand.

---

### MIG-3: Migration 0006 and 0007 both create `daily_ai_spend` — potential conflict

**File:** `packages/db/drizzle/0006_dashboard_layout.sql` and `0007_idempotency_keys.sql`

Migration 0006 creates `daily_ai_spend` with `day date PRIMARY KEY NOT NULL`. Migration 0007 also creates `daily_ai_spend` with `CREATE TABLE IF NOT EXISTS`. The `IF NOT EXISTS` guard prevents a hard failure, but the table in 0007 has the same structure — this is redundant and indicates the migrations were generated without proper snapshot diffing (see MIG-1).

**Fix:** Remove the duplicate `CREATE TABLE` from 0007. The table already exists from 0006.

---

### MIG-4: Migration 0009 drops `onchain_signals` table that may not exist

**File:** `packages/db/drizzle/0009_news_articles.sql` (line ~55)
**Code:**
```sql
DO $$ BEGIN
  ALTER TABLE "onchain_signals" DISABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "onchain_signals" CASCADE;
```

This defensive code suggests there was once an `onchain_signals` table with RLS that was removed. The `DO $$ ... EXCEPTION` block is fine, but it's dead code if the table never existed in any deployed environment.

**Recommendation:** Verify whether `onchain_signals` ever existed. If not, remove these lines for cleanliness. If it did, keep them — they're harmless.

---

### MIG-5: No down/rollback migrations

The migration system has no rollback path. All migrations are forward-only. If a migration breaks production, there's no automated way to roll back.

**Recommendation:** This is a conscious choice for many teams. If rollbacks are needed, consider:
1. Writing inverse SQL for each migration in a `down/` directory
2. Using `drizzle-kit migrate --rollback` (if supported in future versions)
3. Always deploying with a backup + `pg_restore` strategy

For now, document the forward-only policy and ensure every migration is tested against a copy of production data before deployment.

---

### MIG-6: PGlite migration sanitization is fragile and duplicates logic

**File:** `packages/db/src/pglite-client.ts` (`sanitizeStatement` function) and test files

The `sanitizeStatement` function strips pgvector-specific SQL so PGlite (which doesn't have pgvector) can run the migrations. The same sanitization logic is duplicated in:
- `packages/db/src/pglite-client.ts`
- `packages/db/test/migration-0013-chat-model.test.ts`
- `packages/db/test/migration-0014.test.ts`

If the sanitization regex changes, it must be updated in 3 places.

**Fix:** Export `sanitizeStatement` from `pglite-client.ts` and import it in the test files. Make it a single source of truth.

---

## 5. Indexing Gaps & Performance

### IDX-1: `chat_messages` missing `user_id` index for authorization queries

Since `chat_messages` has no `user_id` column, authorization queries must JOIN `chat_threads` to filter by user. The existing index `chat_messages_thread_idx` on `(thread_id, created_at)` helps for thread-scoped queries, but cross-thread queries (e.g., "all messages by user X") require a full scan of `chat_threads` first.

**Recommendation:** This is acceptable given the schema design. Ensure all message queries start from `chat_threads` (which has `chat_threads_user_id_idx`).

---

### IDX-2: `news_articles` missing full-text search index on `title` and `summary`

**File:** `packages/db/drizzle/0004_journal_system.sql` mentions full-text search but the index is truncated in the file.

Migration 0004 mentions:
```sql
CREATE INDEX IF NOT EXISTS "news_article...
```
(truncated). Verify that a GIN index on `to_tsvector('english', title || ' ' || summary)` exists. If not, add one — it's critical for the hybrid retrieval pipeline mentioned in the comments.

**Fix:** Check if the full-text index was created. If not, add a migration:
```sql
CREATE INDEX IF NOT EXISTS news_articles_tsv_idx ON news_articles USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'')));
```

---

### IDX-3: `decision_signal_outcomes` missing index on `evaluated_at` for time-range queries

**File:** `packages/db/src/schema/decision-signals.ts`

The outcomes table has indexes on `(signal_id, horizon)` and `signal_id`, but no index on `evaluated_at`. If the evaluation cron queries "all outcomes evaluated in the last 24h", it will scan the whole table.

**Fix:** Add `index('decision_signal_outcomes_evaluated_idx').on(t.evaluatedAt)`.

---

### IDX-4: `candles_1m` missing `created_at` index for retention pruning

**File:** `packages/db/src/schema/candles-1m.ts`

The comment says retention is "pruned to the trailing 14 days by a tail step in the snapshots nightly job". The pruning query likely does `DELETE FROM candles_1m WHERE t < now() - interval '14 days'`. The existing PK on `(symbol, t)` covers this, so this is actually fine. No fix needed.

---

### IDX-5: `agent_opinions` index uses non-standard naming convention

**File:** `packages/db/src/schema/agent-opinions.ts`
**Code:**
```ts
index('idx_agent_opinions_thread').on(t.threadId),
index('idx_agent_opinions_user_created').on(t.userId, t.createdAt),
```

All other indexes in the schema use the convention `<table>_<columns>_idx` (e.g., `alerts_user_id_idx`, `chat_threads_user_id_idx`). The `agent_opinions` indexes use `idx_` prefix, breaking the pattern.

**Fix:** Rename to `agent_opinions_thread_idx` and `agent_opinions_user_created_idx` in a migration.

---

### IDX-6: `chat_telemetry` has redundant single-column indexes covered by composite

**File:** `packages/db/src/schema/telemetry.ts`

The table has:
- `chat_telemetry_user_id_idx` on `(user_id)`
- `telemetry_created_idx` on `(created_at)`
- `telemetry_user_created_idx` on `(user_id, created_at)` — added in PERF-03

The composite index `(user_id, created_at)` can serve queries that filter on `user_id` alone (leftmost prefix), making `chat_telemetry_user_id_idx` redundant. Similarly, `telemetry_created_idx` is only useful for global time-range queries without user filtering.

**Recommendation:** Drop `chat_telemetry_user_id_idx` since the composite covers it. Keep `telemetry_created_idx` for admin/global queries. Create a migration to drop the redundant index.

---

## 6. Security Concerns

### SEC-1: No Row Level Security (RLS) policies

The project uses Supabase in production, which supports RLS. No RLS policies are defined on any table. This means:
1. If the service role key is compromised, all data is accessible
2. If the anon key is accidentally used for a query, all users' data is exposed
3. There's no defense-in-depth at the database level

The `onchain_signals` table had RLS disabled and was dropped (migration 0009), suggesting RLS was considered at some point.

**Recommendation:** Enable RLS on all user-scoped tables and create policies that enforce `user_id = auth.uid()`. This is a significant project but critical for a multi-tenant app. At minimum, document that RLS should be enabled before production deployment.

---

### SEC-2: `aiApiKeys` stored as encrypted text, not JSONB

**File:** `packages/db/src/schema/auth.ts` (userSettings)
**Code:** `aiApiKeys: text('ai_api_keys')`

The comment says "Encrypted JSON payload of BYOK API keys. Encrypted at rest with AES-256-GCM." Storing encrypted JSON as `text` instead of `jsonb` means:
1. No JSON validation at the database level
2. Cannot query individual provider keys without decrypting
3. No JSONB indexing benefits

This is actually a deliberate security choice — encrypting the entire payload as a single text blob is more secure than encrypting individual JSONB fields, because the encrypted blob is opaque to the database and any attacker with read access to the DB.

**Recommendation:** This is acceptable. Document the encryption scheme and ensure the `ENCRYPTION_SECRET` is never logged or exposed.

---

### SEC-3: `telegramBotToken` stored in plaintext in `user_settings`

**File:** `packages/db/src/schema/auth.ts` (userSettings)
**Code:** `telegramBotToken: text('telegram_bot_token')`

The Telegram bot token is stored as plaintext. If the database is compromised, attackers get full control of the user's Telegram bot. Unlike `aiApiKeys` which is encrypted, the Telegram token is raw text.

**Fix:** Encrypt `telegramBotToken` using the same AES-256-GCM scheme as `aiApiKeys`, or store it in a separate `user_credentials` table with encryption.

---

### SEC-4: SSL configuration uses `rejectUnauthorized: false`

**File:** `packages/db/src/client.ts`
**Code:** `ssl: { rejectUnauthorized: false }`

This disables SSL certificate verification, making the connection vulnerable to man-in-the-middle attacks. While this is common with Supabase's pooler (which uses a self-signed cert), it should be documented and ideally replaced with the correct CA certificate.

**Fix:** If using Supabase, download their CA cert and configure:
```ts
ssl: { ca: process.env.SUPABASE_CA_CERT, rejectUnauthorized: true }
```
Or use `ssl: 'require'` if the driver supports it. At minimum, document why this is disabled.

---

### SEC-5: `statement_timeout` is 15 seconds — may be too high for serverless

**File:** `packages/db/src/client.ts`
**Code:** `connection: { statement_timeout: 15000 }`

A 15-second statement timeout is reasonable for a worker process but may be too high for Vercel serverless functions, which have a 10-second timeout on the Hobby plan and 60s on Pro. A slow query that takes 14s will consume the entire function timeout.

**Recommendation:** Set `statement_timeout` to 8000 for web (Vercel) and 30000 for worker. Use the same `resolvePoolMax()` pattern to differentiate.

---

## 7. Data Integrity & Constraint Issues

### DATA-1: `cot_reports` integer columns should be `bigint`

**File:** `packages/db/src/schema/cot.ts`

CFTC position counts can exceed 2.1 billion (the max for PostgreSQL `integer`). Large commercial positions in gold futures regularly exceed this. The columns `dealerLong`, `dealerShort`, `assetLong`, `assetShort`, `leveragedLong`, `leveragedShort`, `otherLong`, `otherShort` are all `integer` — they should be `bigint`.

**Fix:** Change all position count columns from `integer` to `bigint` in a migration. This is a data type change that requires `ALTER TABLE ... ALTER COLUMN ... TYPE bigint`.

---

### DATA-2: `journal_entries` has no validation on `outcome` vs `closedAt` consistency

**File:** `packages/db/src/schema/journal.ts`

A journal entry can have `outcome = 'win'` but `closedAt = NULL`, or `outcome = 'open'` but `closedAt` set. There's no CHECK constraint enforcing consistency.

**Fix:** Add a CHECK constraint:
```sql
ALTER TABLE journal_entries ADD CONSTRAINT journal_outcome_closed_consistency
  CHECK (
    (outcome = 'open' AND closed_at IS NULL) OR
    (outcome IN ('win', 'loss', 'breakeven') AND closed_at IS NOT NULL)
  );
```

---

### DATA-3: `portfolio_positions` has no validation on `status` vs `closedAt` consistency

**File:** `packages/db/src/schema/portfolio.ts`

Same issue as DATA-2. A position can have `status = 'closed'` but `closedAt = NULL` and `closePrice = NULL`.

**Fix:** Add a CHECK constraint:
```sql
ALTER TABLE portfolio_positions ADD CONSTRAINT portfolio_status_closed_consistency
  CHECK (
    (status = 'open' AND closed_at IS NULL) OR
    (status = 'closed' AND closed_at IS NOT NULL)
  );
```

---

### DATA-4: `alerts.snoozeHours` has no CHECK constraint for max value

**File:** `packages/db/src/schema/alerts.ts`

The comment says "0..168" (0 to 7 days), but there's no CHECK constraint. A value of 999999 would be accepted.

**Fix:** Add `CHECK (snooze_hours >= 0 AND snooze_hours <= 168)`.

---

### DATA-5: `decision_signals` has no CHECK on `confidence` range

**File:** `packages/db/src/schema/decision-signals.ts`

The comment says "0.0–1.0" but there's no CHECK constraint. A confidence of 5.0 or -1.0 would be accepted.

**Fix:** Add `CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0))`.

---

### DATA-6: `portfolio_settings.maxRiskPerTradePct` and `maxTotalExposurePct` have no range checks

**File:** `packages/db/src/schema/portfolio.ts`

No CHECK constraint ensures these are between 0 and 100.

**Fix:** Add `CHECK (max_risk_per_trade_pct >= 0 AND max_risk_per_trade_pct <= 100)` and same for `max_total_exposure_pct`.

---

### DATA-7: `briefings_emitted.kind` has no CHECK constraint

**File:** `packages/db/src/schema/briefings.ts`

The comment says `kind ∈ {'pre', 'post', 'weekly_review'}` but there's no constraint.

**Fix:** Add `CHECK (kind IN ('pre', 'post', 'weekly_review'))`.

---

## 8. Connection Pool & Client Issues

### POOL-1: No connection retry logic on cold start

**File:** `packages/db/src/client.ts`

The `getDb()` function creates the connection pool lazily but has no retry logic. If the database is temporarily unreachable during a Vercel cold start, the function will throw and the request will fail.

**Recommendation:** Add a simple retry wrapper (1 retry with 500ms delay) around the first query. Or rely on Vercel's automatic function retry.

---

### POOL-2: `closeDb()` timeout is only 5 seconds

**File:** `packages/db/src/client.ts`
**Code:** `await _sql.end({ timeout: 5 });`

If there are long-running queries, `closeDb()` will force-close connections after 5 seconds, potentially leaving transactions in an inconsistent state.

**Recommendation:** Increase to 10 seconds for graceful shutdown. This is only called in tests/scripts, so the impact is low.

---

### POOL-3: PGlite client doesn't support concurrent writes

**File:** `packages/db/src/pglite-client.ts`

PGlite is single-threaded and doesn't support concurrent writes. If two API routes try to write simultaneously during local development, one will fail. This is a known limitation of PGlite.

**Recommendation:** Document this limitation. For local dev, it's acceptable since the dev server is single-process. If concurrent write tests are needed, use a real Postgres instance via Docker.

---

## 9. Testing Gaps

### TEST-1: No schema validation tests

There are no tests that validate the schema definition matches the migration SQL. If someone adds a column to the schema but forgets to generate a migration, the drift won't be caught until deployment.

**Fix:** Add a test that:
1. Applies all migrations to a fresh PGlite instance
2. Introspects the resulting schema
3. Compares it against the Drizzle schema definitions
4. Fails if there's drift

---

### TEST-2: No tests for the `withIsolatedDb` test utility

**File:** `packages/db/src/test-utils.ts`

The `withIsolatedDb` helper uses a transaction rollback pattern but has no tests verifying that the rollback actually works.

**Fix:** Add a test that inserts a row inside `withIsolatedDb`, verifies it's visible inside the transaction, then verifies it's gone after the transaction rolls back.

---

### TEST-3: No migration application test for the full migration chain

While individual migrations (0013, 0014) have tests, there's no test that applies ALL 27 migrations in sequence on a fresh database and verifies the final schema matches expectations.

**Fix:** Add a test that:
1. Creates a fresh PGlite instance
2. Applies all migrations via `applyMigrations()`
3. Verifies all expected tables exist
4. Verifies key constraints and indexes exist

---

### TEST-4: Coverage threshold is only 50%

**File:** `packages/db/vitest.config.ts`
**Code:** `thresholds: { statements: 50, branches: 50, functions: 50, lines: 50 }`

50% coverage is low for a database package that handles financial data. The `rate-limit.ts` and `with-user-scope.ts` have good coverage, but `client.ts`, `local-db.ts`, and `pglite-client.ts` likely have minimal coverage.

**Recommendation:** Raise to 70% after adding the missing tests above.

---

## 10. Code Quality & Consistency

### CODE-1: `void sql;` hack to silence unused import lint

**File:** `packages/db/src/schema/memory.ts` (last line)
**Code:** `void sql; // silence unused-import lint when bundled in isolation`

The `sql` import from `drizzle-orm` is imported but only used in a `sql\`'{}'::text[]\`` default expression. If the import is truly unused in some bundling scenarios, the `void` statement silences the lint. This is a code smell.

**Fix:** Remove the `sql` import if it's truly unused, or remove the `void sql;` if it is used.

---

### CODE-2: Inconsistent index definition styles

Some tables use array return for indexes, others use object return:

**Array style:**
```ts
(t) => [
  index('alerts_user_id_idx').on(t.userId),
  index('alerts_active_idx').on(t.active),
],
```

**Object style:**
```ts
(t) => ({
  userIdIdx: index('audit_logs_user_id_idx').on(t.userId),
  actionIdx: index('audit_logs_action_idx').on(t.action),
}),
```

Both work, but the inconsistency makes the codebase harder to scan.

**Recommendation:** Standardize on the array style (more common in the codebase).

---

### CODE-3: `withUserScope` helper is barely used

**File:** `packages/db/src/with-user-scope.ts`

The helper was created to DRY up the `eq(table.userId, userId)` pattern, but based on the codebase, most queries still use `eq(table.userId, userId)` directly. The helper adds indirection without much benefit.

**Recommendation:** Either commit to using it everywhere, or remove it and use `eq()` directly. The current state is worse than either extreme.

---

### CODE-4: `withUserScope` JSDoc lists wrong tables

**File:** `packages/db/src/with-user-scope.ts`
**Code:** `// the 8 user-scoped tables: chatThreads, chatTelemetry, chatToolTelemetry, alerts, journalEntries, memoryEmbeddings, pushSubscriptions, sharedSnapshots, plus userSymbols which is keyed by userId`

This lists 9 tables, not 8. It also omits `agentOpinions`, `decisionSignals`, `decisionSignalFeedback`, `portfolioPositions`, `portfolioSettings`, `notificationNoiseState`, `botLinks`, `providerTests`, `briefingsEmitted`, `dailyAiSpend`, `userSessions`, `rateLimits` — all of which have `userId`.

**Fix:** Update the comment to list all user-scoped tables, or remove the specific list and say "any table with a userId column".

---

## 11. Improvements & Upgrades

### IMP-1: Add database health check endpoint

There's no dedicated health check that verifies the database is reachable and migrations are up to date. The Docker health check hits `/api/health` but it's unclear if that checks DB connectivity.

**Recommendation:** Create `/api/health/db` that:
1. Runs `SELECT 1` to verify connectivity
2. Checks `SELECT count(*) FROM __drizzle_migrations` against the expected migration count
3. Returns 503 if either check fails

---

### IMP-2: Add migration status tracking

There's no way to know which migrations have been applied without querying the database directly. Add a `pnpm migrate:status` script that runs `drizzle-kit migrate --status` or queries `__drizzle_migrations`.

---

### IMP-3: Add automated backup verification

For a trading platform, data loss is critical. Add a cron job that:
1. Takes a daily `pg_dump` of the database
2. Verifies the backup can be restored to a temporary database
3. Alerts if the backup is corrupted

---

### IMP-4: Consider partitioning for high-volume tables

`candles_1m` and `chat_telemetry` are the highest-volume tables. `candles_1m` grows at ~60K rows/month (14-day retention), which is manageable. `chat_telemetry` grows unbounded — one row per assistant turn plus title/routing events.

**Recommendation:** Add monthly partitioning to `chat_telemetry` once it exceeds ~1M rows. Use `pg_partman` or native declarative partitioning.

---

### IMP-5: Add `updated_at` trigger for tables that need it

Several tables have `updatedAt` with `.$onUpdate(() => new Date())`, but this only works when updates go through Drizzle ORM. Raw SQL updates (like the rate limiter's `ON CONFLICT DO UPDATE`) bypass the `.$onUpdate` hook.

**Recommendation:** For critical tables, add a Postgres trigger:
```sql
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
```
And attach it to tables with `updated_at` columns.

---

### IMP-6: Add soft-delete support to more tables

Only `user` has `deletedAt` for soft delete. Other tables (`journal_entries`, `portfolio_positions`, `alerts`) use hard deletes via `ON DELETE CASCADE`. For a trading platform, audit trails are important.

**Recommendation:** Add `deletedAt` to `journal_entries`, `portfolio_positions`, and `decision_signals`. Change delete operations to set `deletedAt = now()` instead of actually deleting. Add a periodic cleanup cron to hard-delete rows older than 90 days with `deletedAt IS NOT NULL`.

---

## 12. Polish & Cleanup

### POLISH-1: Remove unused `_extensions.ts` or make it functional

**File:** `packages/db/src/schema/_extensions.ts`

The file exports `REQUIRED_EXTENSIONS` but this constant is never imported anywhere. It's documentation-only.

**Fix:** Either use it in the migration setup script, or convert it to a pure comment in `index.ts`.

---

### POLISH-2: Standardize migration file naming

Migrations 0000–0008 use descriptive names (`0000_lazy_red_shift`, `0001_phase_1_completion`). Migrations 0009+ mix descriptive names (`0009_news_articles`, `0025_multi_agent_orchestration`) with Drizzle's auto-generated names (`0015_open_komodo`, `0016_windy_cobalt_man`).

**Recommendation:** Future migrations should use descriptive names only. The auto-generated names are meaningless.

---

### POLISH-3: Add `COMMENT ON TABLE` for all tables

Several tables have `COMMENT ON COLUMN` but no `COMMENT ON TABLE`. Adding table-level comments helps with database exploration tools (pgAdmin, DBeaver, Drizzle Studio).

---

### POLISH-4: Remove `setup-telegram-webhook.ts` from db package

**File:** `packages/db/scripts/setup-telegram-webhook.ts`

This script is in the `db` package but is about Telegram webhook setup, not database management. It should be in the `apps/web/scripts/` or a dedicated `scripts/` directory.

---

### POLISH-5: Add `tsconfig.json` path alias for cleaner imports

The schema files use relative imports (`import { users } from './auth'`). Consider adding a `@hamafx/db/schema/*` path alias for cleaner imports from consuming packages.

---

## 13. Execution Plan (Ordered Tasks)

> **For the implementing agent:** Execute these tasks in order. Each task is self-contained. Create a new branch `fix/database-architecture-remediation` for all changes. Commit after each task group.

### Phase 1: Critical Fixes (do these first)

| # | Task | Files | Priority |
|---|------|-------|----------|
| 1 | Fix `extensionsFilters` in drizzle.config.ts → `['vector']` | `packages/db/drizzle.config.ts` | CRITICAL |
| 2 | Fix double `.notNull()` in `briefings.ts` and `daily-ai-spend.ts` | `packages/db/src/schema/briefings.ts`, `packages/db/src/schema/daily-ai-spend.ts` | CRITICAL |
| 3 | Fix `provider_tests` to use `primaryKey()` instead of `index()` | `packages/db/src/schema/provider-tests.ts` + new migration | CRITICAL |
| 4 | Re-add FK on `rate_limits.user_id` → `user.id` | `packages/db/src/schema/rate-limits.ts` + new migration | CRITICAL |
| 5 | Fix `docker-entrypoint.sh` to fail on migration errors | `apps/web/docker-entrypoint.sh` | CRITICAL |
| 6 | Fix or delete `migrate-v2.ts` (references non-existent exports) | `packages/db/scripts/migrate-v2.ts` | CRITICAL |

### Phase 2: Data Integrity Constraints

| # | Task | Files |
|---|------|-------|
| 7 | Add CHECK constraints for `alerts.snoozeHours` (0–168) | New migration |
| 8 | Add CHECK constraint for `decision_signals.confidence` (0.0–1.0) | New migration |
| 9 | Add CHECK constraints for `portfolio_settings` percentage fields (0–100) | New migration |
| 10 | Add CHECK for `briefings_emitted.kind` ∈ {pre, post, weekly_review} | New migration |
| 11 | Add CHECK for `journal_entries` outcome/closedAt consistency | New migration |
| 12 | Add CHECK for `portfolio_positions` status/closedAt consistency | New migration |
| 13 | Change `cot_reports` integer columns to `bigint` | New migration |

### Phase 3: Schema Fixes

| # | Task | Files |
|---|------|-------|
| 14 | Fix `memory_embeddings` unique constraint to include `user_id` | `packages/db/src/schema/memory.ts` + new migration |
| 15 | Add unique constraint on `snapshots(symbol, kind, as_of)` | `packages/db/src/schema/snapshots.ts` + new migration |
| 16 | Rename `agent_opinions` indexes to standard naming convention | `packages/db/src/schema/agent-opinions.ts` + new migration |
| 17 | Drop redundant `chat_telemetry_user_id_idx` (covered by composite) | New migration |
| 18 | Add `evaluated_at` index to `decision_signal_outcomes` | `packages/db/src/schema/decision-signals.ts` + new migration |

### Phase 4: Security

| # | Task | Files |
|---|------|-------|
| 19 | Encrypt `telegramBotToken` in `user_settings` (same AES-256-GCM scheme as `aiApiKeys`) | `packages/db/src/schema/auth.ts` + encryption utility + migration |
| 20 | Document SSL `rejectUnauthorized: false` rationale or fix with CA cert | `packages/db/src/client.ts` |
| 21 | Set per-runtime `statement_timeout` (8s web, 30s worker) | `packages/db/src/client.ts` |
| 22 | Document RLS policy plan (or implement if time permits) | New doc `docs/rls-policy-plan.md` |

### Phase 5: Migration System

| # | Task | Files |
|---|------|-------|
| 23 | Regenerate drizzle-kit meta snapshots | `packages/db/drizzle/meta/` |
| 24 | Remove `run_drizzle.py` (fragile pexpect wrapper) | `packages/db/run_drizzle.py` |
| 25 | Remove duplicate `daily_ai_spend` creation from migration 0007 | `packages/db/drizzle/0007_idempotency_keys.sql` |
| 26 | Export `sanitizeStatement` from pglite-client.ts and deduplicate in tests | `packages/db/src/pglite-client.ts`, test files |

### Phase 6: Testing

| # | Task | Files |
|---|------|-------|
| 27 | Add full migration chain test (apply all 27 migrations on fresh PGlite) | `packages/db/test/full-migration-chain.test.ts` |
| 28 | Add schema drift test (compare Drizzle schema vs introspected DB) | `packages/db/test/schema-drift.test.ts` |
| 29 | Add `withIsolatedDb` rollback verification test | `packages/db/test/isolated-db.test.ts` |
| 30 | Raise coverage threshold to 70% | `packages/db/vitest.config.ts` |

### Phase 7: Code Quality & Polish

| # | Task | Files |
|---|------|-------|
| 31 | Remove `void sql;` hack in `memory.ts` | `packages/db/src/schema/memory.ts` |
| 32 | Standardize index definition style (use array everywhere) | All schema files |
| 33 | Update `withUserScope` JSDoc to list all user-scoped tables | `packages/db/src/with-user-scope.ts` |
| 34 | Remove or commit to using `withUserScope` across the codebase | All persistence files |
| 35 | Remove unused `REQUIRED_EXTENSIONS` or make it functional | `packages/db/src/schema/_extensions.ts` |
| 36 | Move `setup-telegram-webhook.ts` out of db package | `packages/db/scripts/` → `apps/web/scripts/` |
| 37 | Add `COMMENT ON TABLE` for all tables | New migration |
| 38 | Add `updated_at` Postgres trigger function for raw SQL updates | New migration |

### Phase 8: Improvements (Lower Priority)

| # | Task | Files |
|---|------|-------|
| 39 | Add `/api/health/db` endpoint with migration count check | `apps/web/src/app/api/health/db/route.ts` |
| 40 | Add `pnpm migrate:status` script | `packages/db/package.json` |
| 41 | Add soft-delete (`deletedAt`) to `journal_entries`, `portfolio_positions`, `decision_signals` | Schema files + migration |
| 42 | Plan `user_settings` split into focused tables (document only, don't execute yet) | New doc `docs/user-settings-split-plan.md` |
| 43 | Add Postgres enums for fixed-value fields (status, action, role, etc.) | Schema files + migration |
| 44 | Add full-text search index on `news_articles` if missing | New migration |
| 45 | Add monthly partitioning plan for `chat_telemetry` (document only) | New doc |

---

## Appendix: File Reference Index

| File | Issues Found |
|------|-------------|
| `packages/db/drizzle.config.ts` | CRITICAL-1 |
| `packages/db/scripts/migrate-v2.ts` | CRITICAL-2 |
| `packages/db/src/schema/briefings.ts` | CRITICAL-3, DATA-7 |
| `packages/db/src/schema/daily-ai-spend.ts` | CRITICAL-4 |
| `packages/db/src/schema/rate-limits.ts` | CRITICAL-5 |
| `packages/db/src/schema/provider-tests.ts` | CRITICAL-6 |
| `apps/web/docker-entrypoint.sh` | CRITICAL-7 |
| `packages/db/src/schema/auth.ts` | FLAW-1, FLAW-2, SEC-2, SEC-3 |
| `packages/db/src/schema/snapshots.ts` | FLAW-4 |
| `packages/db/src/schema/calendar.ts` | FLAW-5 |
| `packages/db/src/schema/chat.ts` | FLAW-6 |
| `packages/db/src/schema/memory.ts` | FLAW-7, CODE-1 |
| `packages/db/drizzle/meta/` | MIG-1 |
| `packages/db/run_drizzle.py` | MIG-2 |
| `packages/db/drizzle/0007_idempotency_keys.sql` | MIG-3 |
| `packages/db/drizzle/0009_news_articles.sql` | MIG-4 |
| `packages/db/src/pglite-client.ts` | MIG-6, POOL-3 |
| `packages/db/src/schema/telemetry.ts` | IDX-6 |
| `packages/db/src/schema/agent-opinions.ts` | IDX-5 |
| `packages/db/src/schema/decision-signals.ts` | IDX-3, DATA-5 |
| `packages/db/src/schema/journal.ts` | DATA-2 |
| `packages/db/src/schema/portfolio.ts` | DATA-3, DATA-6 |
| `packages/db/src/schema/alerts.ts` | DATA-4 |
| `packages/db/src/schema/cot.ts` | DATA-1 |
| `packages/db/src/client.ts` | POOL-1, POOL-2, SEC-4, SEC-5 |
| `packages/db/src/with-user-scope.ts` | CODE-3, CODE-4 |
| `packages/db/src/schema/_extensions.ts` | POLISH-1 |
| `packages/db/vitest.config.ts` | TEST-4 |
| `packages/db/src/test-utils.ts` | TEST-2 |

---

*Generated by deep analysis of the HamaFX-Ai database architecture. Every finding references exact files and code locations. The implementing agent should work through the Execution Plan in order, creating migrations as needed and running the test suite after each phase.*