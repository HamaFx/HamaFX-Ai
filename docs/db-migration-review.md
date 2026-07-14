# DB Migration Review & Analysis

> **Scope:** READ-ONLY review. No database or schema files were modified.
> **Date:** 2026-07-13
> **Source of truth:** `packages/db/src/schema/` (Drizzle definitions)
> **Production DB:** `db.cxljcbrygnkobqnyxxeg.supabase.co` — PostgreSQL 17.6

---

## 1. Executive Summary

HamaFX-Ai has **42 migration files** (0000–0041) in `packages/db/drizzle/` tracked by a Drizzle Kit journal, but production has **significant schema drift** on three axes: (a) objects that exist in the Drizzle schema but were never tracked by a migration (`feature_flags`, `diagnostic_traces`, `symbol_catalog` provider columns), (b) objects that exist in production but are **not** in the Drizzle schema (`tenant_id` on 10 global/shared tables, `symbol_catalog.n_data_symbol`, `diagnostic_traces.summary`/`metadata`), and (c) infrastructure drift — the `update_updated_at()` trigger function is the **broken hardcoded version** (migration 0040) rather than the column-name-agnostic fix (0039/0041), and `account`/`session` tables have **FORCE RLS with zero policies** (migration 0039's disable-RLS fix never took effect through the Supabase pooler).

The migration tracking situation is more nuanced than the prompt suggests: `public.__drizzle_migrations` does NOT exist, but **`drizzle.__drizzle_migrations`** (the drizzle-orm default schema) **does** exist with **24 applied entries** (out of 42 in the journal). The `scripts/predeploy-migrate.mjs` script runs `drizzle-kit migrate` on every Vercel production deploy, which checks the `drizzle` schema's tracking table. Since only 24 of 42 migrations are recorded as applied, the next predeploy will attempt to apply the remaining 18 — and many of those (especially 0000–0014) use **non-idempotent DDL** (`CREATE TABLE` without `IF NOT EXISTS`, `ALTER TABLE ADD COLUMN` without `IF NOT EXISTS`) that will **fail on already-existing objects, blocking the deploy**. **Do not run `drizzle-kit push`** — it would drop `tenant_id` from 10 global tables and `n_data_symbol` from `symbol_catalog`, causing data loss.

---

## 2. Migration File Audit (0000–0041)

Each migration was read in full. The table below summarizes what each does, whether it's idempotent, and whether its changes are reflected in prod.

| # | File | What it does | Idempotent? | In prod? |
|---|------|-------------|-------------|----------|
| 0000 | `0000_lazy_red_shift.sql` | Creates 8 base tables: `chat_messages`, `chat_threads`, `alerts`, `journal_entries`, `news_articles`, `news_embeddings`, `economic_events`, `snapshots`, `chat_telemetry` + FKs + 16 indexes (incl. HNSW vector, GIN) | **No** — bare `CREATE TABLE` / `CREATE INDEX` | ✅ Tables exist |
| 0001 | `0001_phase_1_completion.sql` | Adds `title_source` to `chat_threads`, `kind` to `chat_telemetry` | **No** | ✅ |
| 0002 | `0002_phase_2.sql` | Creates `briefings_emitted` (PK: event_id+kind), adds `is_briefings` to `chat_threads`, `actuals_filled_at` to `economic_events`, FK | **No** | ✅ |
| 0003 | `0003_alert_system.sql` | Creates `cot_reports`, `shared_snapshots`, `push_subscriptions` + indexes | **No** | ✅ |
| 0004 | `0004_journal_system.sql` | Creates `memory_embeddings` (vector 1536) + 6 indexes, `chat_tool_telemetry` + 3 indexes, `news_articles_fts_idx` GIN index | **Partial** | ✅ |
| 0005 | `0005_market_data.sql` | Creates `live_ticks`, `candles_1m` + index. Hand-edited to skip memory/chat_tool tables. | **No** | ✅ |
| 0006 | `0006_dashboard_layout.sql` | Creates `daily_ai_spend` (PK: day), adds unique constraint `memory_embeddings_kind_source_uk` (kind, source_id) | **No** | ✅ (PK later changed by 0009) |
| 0007 | `0007_idempotency_keys.sql` | Creates `provider_throttle`, re-adds `memory_embeddings_kind_source_uk` via DO block | **Yes** | ✅ |
| 0008 | `0008_handoff_tables.sql` | Creates `intermarket_resonance` | **No** | ✅ |
| 0009 | `0009_news_articles.sql` | **Multi-user migration.** Creates NextAuth tables (`account`, `session`, `user_settings`, `user_symbols`, `user`, `verificationToken`, `rate_limits`), inserts `__system__` user, drops `onchain_signals`, drops/recreates `briefings_emitted` PK (adds `user_id`), adds `user_id` to 14 tables + FKs + indexes, changes `daily_ai_spend` PK to (user_id, day) | **No** | ✅ |
| 0010 | `0010_provider_tests.sql` | Creates `provider_tests` + index + FK | **No** | ✅ |
| 0011 | `0011_alert_snooze.sql` | Adds `last_fired_at`, `snooze_hours` to `alerts` + index | **No** | ✅ |
| 0012 | `0012_default_models.sql` | Adds `default_models` jsonb to `user_settings` + comment | **No** | ✅ |
| 0013 | `0013_chat_model.sql` | Adds `chat_model` to `user_settings`, backfills from `default_models` JSONB | **No** | ✅ |
| 0014 | `0014_vision_embedding_model.sql` | Adds `vision_model`, `embedding_model` to `user_settings` + comments | **No** | ✅ |
| 0015 | `0015_open_komodo.sql` | Creates `audit_logs`, `symbol_catalog` (10 cols, no provider symbols), seeds 3 symbols, drops/re-adds `rate_limits` FK | **Partial** | ✅ (prod has extra provider columns) |
| 0016 | `0016_windy_cobalt_man.sql` | Adds `ai_fallback_chain` jsonb to `user_settings` | **No** | ✅ |
| 0017 | `0017_fantastic_mastermind.sql` | Adds `monthly_budget_limit`, `provider_spending_thresholds`, `spend_alerts_config`, `spend_alerts_state` to `user_settings` | **No** | ✅ |
| 0018 | `0018_bizarre_amazoness.sql` | Adds `ai_api_keys_updated_at` to `user_settings` | **No** | ✅ |
| 0019 | `0019_funny_silver_centurion.sql` | Adds `market_data_provider` (default 'biquote') to `user_settings` | **No** | ✅ |
| 0020 | `0020_broken_azazel.sql` | Adds `rate_limit` jsonb to `provider_tests` | **No** | ✅ |
| 0022 | `0022_many_proteus.sql` | Creates `user_sessions`, adds `disabled_tools` to `user_settings`, adds `tokenVersion`, `two_factor_secret`, `two_factor_enabled` to `user` | **Yes** — `IF NOT EXISTS` | ✅ |
| 0023 | `0023_burly_nightcrawler.sql` | Creates `cron_runs` (no PK yet), adds `cron_runs_status_idx`, `telemetry_user_created_idx` | **No** | ✅ |
| 0024 | `0024_living_doorman.sql` | Adds PK `cron_runs_pkey` on `cron_runs` (job_name, run_date) | **No** | ✅ |
| 0025 | `0025_multi_agent_orchestration.sql` | Creates `agent_opinions` + indexes, adds `analysis_mode` to `chat_threads` + `user_settings` fields | **Yes** | ✅ |
| 0026 | `0026_decision_signal_tracking.sql` | Creates `decision_signals`, `decision_signal_outcomes`, `decision_signal_feedback`, `portfolio_positions`, `portfolio_settings`, `notification_noise_state`, `bot_links` + indexes | **Yes** | ✅ |
| 0027 | `0027_phase1_critical_fixes.sql` | Replaces `provider_tests` index with composite PK, re-adds `rate_limits` FK | **Yes** | ✅ |
| 0028 | `0028_phase2_data_integrity.sql` | Adds 7 CHECK constraints, converts `cot_reports` 8 integer columns to bigint | **Yes** | ✅ |
| 0029 | `0029_phase3_schema_fixes.sql` | Replaces `memory_embeddings` unique → (user_id,kind,source_id), adds `snapshots` unique, renames `agent_opinions` indexes, drops redundant index, adds outcome index | **Yes** | ✅ |
| 0030 | `0030_phase4_security.sql` | Comment on `user_settings.telegram_bot_token` (encryption documentation) | **Yes** | ✅ |
| 0031 | `0031_phase7_comments_and_triggers.sql` | COMMENT ON TABLE for 30 tables, creates `update_updated_at()` (**hardcoded `NEW.updated_at`**), creates 7 `trg_updated_at_*` triggers | **Yes** — DROP IF EXISTS | ✅ (but function is broken — see §4) |
| 0032 | `0032_phase8_soft_delete_enums_fts.sql` | Adds `deleted_at` to 3 tables + indexes, creates 12 enum types, creates `news_fts_idx` GIN index | **Yes** | ✅ |
| 0033 | `0033_fix_analysis_mode.sql` | Adds `failed_login_attempts`, `locked_until` to `user`, re-adds `analysis_mode` to 3 tables | **Yes** | ✅ |
| 0034 | `0034_breezy_absorbing_man.sql` | Adds `onboarding_progress` to `user_settings`, adds `screenshot_url` to `journal_entries` | **No** | ✅ (confirmed in prod) |
| 0035 | `0035_phase3_multitenancy_foundation.sql` | Creates `organization`, `organization_member`, helper functions, **adds `tenant_id` to 24 tables**, backfills, creates tenant_id triggers for 22+2 tables | **No** | ⚠️ **Partially applied** — pooler dropped DDL |
| 0036 | `0036_phase3_tenant_constraints.sql` | Sets `tenant_id` NOT NULL on 24 tables, creates 12 tenant_id indexes, drops `candles_1m_symbol_t_idx` | **No** | ⚠️ Partially applied |
| 0037 | `0037_phase3_bypassrls_admin_role.sql` | Creates `hamafx_admin` role (BYPASSRLS), grants permissions | **Yes** | ✅ (role confirmed) |
| 0038 | `0038_phase3_rls_cutover.sql` | Enables + forces RLS on 25 tables, creates `tenant_isolation` policy on each | **No** | ⚠️ Partially — account/session got RLS but policy failed |
| 0039 | `0039_phase3_runtime_fixes.sql` | Disables RLS on account/session, replaces `update_updated_at()` with column-name-agnostic version, recreates 7 triggers | **No** | ❌ **NOT applied** — prod still has broken function + RLS |
| 0040 | `0040_phase8_billing_nowpayments.sql` | Creates 3 billing enums, `plans`, `subscriptions`, `payments`, `ipn_events` + indexes, **redefines `update_updated_at()` back to hardcoded `NEW.updated_at`**, creates 3 billing triggers | **Partial** | ✅ (but overwrote 0039 fix) |
| 0041 | `0041_fix_missing_tenant_columns.sql` | Re-applies 0035–0039 idempotently: organization, tenant_id columns for 3 tables, backfill, NOT NULL, triggers, re-creates `update_updated_at()` (column-name-agnostic) | **Yes** | ⚠️ Partially — function fix did NOT take effect |

### Migration ↔ Schema Cross-Reference Summary

**Tables with NO migration file (defined in Drizzle schema, created manually in prod):**
- `feature_flags` — defined in `src/schema/feature-flags.ts`, exists in prod, **no migration creates it**
- `diagnostic_traces` — defined in `src/schema/diagnostic-traces.ts`, exists in prod, **no migration creates it**

**Schema columns with NO migration file:**
- `symbol_catalog.twelve_data_symbol`, `.biquote_symbol`, `.binance_symbol`, `.finnhub_symbol` — in Drizzle schema + prod, but no migration 0000–0041 adds them (0015 creates `symbol_catalog` without these columns)

**Tables in prod with `tenant_id` NOT in Drizzle schema (added manually to prod):**
- `candles_1m`, `cot_reports`, `cron_runs`, `economic_events`, `intermarket_resonance`, `live_ticks`, `news_articles`, `news_embeddings`, `snapshots`, `symbol_catalog` — all have `tenant_id` (nullable, default `'__system__'`) in prod, but the Drizzle schema does NOT define `tenant_id` on these global/shared tables

---

## 3. Schema Drift Inventory

Every difference between the Drizzle schema definitions (`packages/db/src/schema/`) and the production database. Risk levels: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low.

### 3.1 Extra columns in prod NOT in Drizzle schema (drizzle-kit push would DROP these → data loss)

| Table | Column | Prod type | Prod default | Risk | Impact if `drizzle-kit push` |
|-------|--------|-----------|-------------|------|------------------------------|
| `symbol_catalog` | `n_data_symbol` | text | — | 🔴 Critical | **Column dropped, data lost** — not in Drizzle schema at all |
| `candles_1m` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped (schema has no tenant_id on this table) |
| `cot_reports` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `cron_runs` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `economic_events` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `intermarket_resonance` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `live_ticks` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `news_articles` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `news_embeddings` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `snapshots` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `symbol_catalog` | `tenant_id` | text | `'__system__'` | 🟠 High | Column dropped |
| `diagnostic_traces` | `summary` | text | — | 🟡 Medium | Column dropped — not in Drizzle schema |
| `diagnostic_traces` | `metadata` | jsonb | — | 🟡 Medium | Column dropped — not in Drizzle schema |
| `diagnostic_traces` | `created_at` | timestamptz | `now()` | 🟡 Medium | Column dropped — not in Drizzle schema |

### 3.2 Columns in Drizzle schema NOT in prod (missing from production)

| Table | Column | Schema definition | Risk | Notes |
|-------|--------|-------------------|------|-------|
| _(none found)_ | — | — | — | All schema-defined columns were confirmed present in prod |

> The prompt mentioned `journal_entries.screenshot_url` and `symbol_catalog.twelve_data_symbol` were previously missing — both are **confirmed present** in prod now (manually added).

### 3.3 Default / nullability mismatches (prod vs Drizzle schema)

| Table | Column | Prod default | Schema default | Prod nullable | Schema nullable | Risk |
|-------|--------|-------------|----------------|---------------|-----------------|------|
| `journal_entries` | `user_id` | `'__system__'::text` | _(none)_ | NO | NO | 🟡 Medium — prod has a default the schema doesn't; push would remove it |
| `user_symbols` | `tenant_id` | `'__system__'::text` | `current_setting('app.current_tenant', true)` | NO | NO | 🟠 High — default mismatch; push would change default from `'__system__'` to `current_setting(...)` |
| `memory_embeddings` | `user_id` | `'__system__'::text` | _(none)_ | NO | NO | 🟡 Medium |
| `shared_snapshots` | `user_id` | `'__system__'::text` | _(none)_ | NO | NO | 🟡 Medium |
| 22 tenant tables | `tenant_id` | _(none — no DB default)_ | `current_setting('app.current_tenant', true)` | NO | NO | 🟠 High — schema expects a DB-level default that prod doesn't have; app relies on ORM-level default or triggers |

### 3.4 Index mismatches

| Table | Prod index name | Schema index name | Issue | Risk |
|-------|----------------|-------------------|-------|------|
| `diagnostic_traces` | `diagnostic_traces_user_id_idx` | `diag_traces_user_id_idx` | 🟡 Name mismatch — prod uses different prefix | Low |
| `diagnostic_traces` | _(missing)_ | `diag_traces_thread_id_idx` | 🟡 Schema defines thread_id index, prod doesn't have it | Low |
| `diagnostic_traces` | `diagnostic_traces_started_at_idx` | `diag_traces_started_at_idx` | 🟡 Name mismatch | Low |
| `news_articles` | `news_fts_idx` + `news_articles_fts_idx` | `news_fts_idx` only | 🟢 Duplicate FTS index (0004 + 0032 both created one) | Low |

### 3.5 Tables in Drizzle schema but with no corresponding migration

| Table | Drizzle schema file | Prod exists? | Migration exists? | Risk |
|-------|-------------------|-------------|-------------------|------|
| `feature_flags` | `feature-flags.ts` | ✅ Yes (manually created) | ❌ No migration | 🟠 High — `drizzle-kit generate` will create a migration that `CREATE TABLE`s an existing table |
| `diagnostic_traces` | `diagnostic-traces.ts` | ✅ Yes (manually created) | ❌ No migration | 🟠 High — same issue, plus prod has extra columns |

### 3.6 Extension status

| Extension | Prod version | Required by | Status |
|-----------|-------------|-------------|--------|
| `vector` | 0.8.0 | `news_embeddings`, `memory_embeddings` (vector 1536) | ✅ |
| `pgcrypto` | 1.3 | `gen_random_uuid()` | ✅ |
| `uuid-ossp` | 1.1 | _(legacy, not actively used)_ | ✅ |
| `pg_stat_statements` | 1.11 | _(monitoring)_ | ✅ |
| `supabase_vault` | 0.3.1 | _(Supabase managed)_ | ✅ |
| `plpgsql` | 1.0 | trigger functions | ✅ |

---

## 4. Trigger Analysis

### 4.1 All triggers in production (14 total)

| Table | Trigger | Type | Function | Status |
|-------|---------|------|----------|--------|
| `chat_messages` | `hamafx_chat_messages_tenant_id` | BEFORE INSERT/UPDATE | `hamafx_set_tenant_id_from_user()` | ✅ Working |
| `chat_threads` | `hamafx_chat_threads_tenant_id` | BEFORE INSERT/UPDATE | `hamafx_set_tenant_id_from_user()` | ✅ Working |
| `chat_threads` | `trg_updated_at_chat_threads` | BEFORE UPDATE | `update_updated_at()` | ✅ Working (`updated_at` exists) |
| `decision_signal_outcomes` | `hamafx_decision_signal_outcomes_tenant_id` | BEFORE INSERT/UPDATE | `hamafx_set_decision_signal_outcome_tenant_id()` | ✅ Working |
| `decision_signals` | `trg_updated_at_decision_signals` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `journal_entries` | `trg_updated_at_journal_entries` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `payments` | `trg_updated_at_payments` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `plans` | `trg_updated_at_plans` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `portfolio_positions` | `trg_updated_at_portfolio_positions` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `portfolio_settings` | `trg_updated_at_portfolio_settings` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `subscriptions` | `trg_updated_at_subscriptions` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |
| `user` | `hamafx_user_personal_organization_after_insert` | AFTER INSERT | `hamafx_provision_personal_organization()` | ✅ Working |
| `user_settings` | `hamafx_user_settings_tenant_id` | BEFORE INSERT/UPDATE | `hamafx_set_tenant_id_from_user()` | ✅ Working |
| `user_settings` | `trg_updated_at_user_settings` | BEFORE UPDATE | `update_updated_at()` | ✅ Working |

### 4.2 Missing trigger (dropped to unblock onboarding)

| Table | Trigger | Created by | Status | Reason |
|-------|---------|-----------|--------|--------|
| `user` | `trg_updated_at_user` | 0031 (line 108) | ❌ **DROPPED** | `update_updated_at()` hardcodes `NEW.updated_at` (snake_case), but `user` table's column is `updatedAt` (camelCase). Every UPDATE on `user` fired the trigger → **error: column "updated_at" does not exist** → blocked all user updates including onboarding. Manually dropped to restore onboarding. |

### 4.3 The `update_updated_at()` function is BROKEN

The production function (confirmed via `pg_get_functiondef`):

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$
```

This is the **migration 0040 version** — it hardcodes `NEW.updated_at`. Migrations 0039 and 0041 both attempted to replace it with a column-name-agnostic version (checking `information_schema.columns` for `'updated_at'` or `'updatedAt'`). **Neither fix took effect** — 0040 runs last and overwrites the function, and 0041's re-creation was silently dropped by the Supabase pooler.

**Impact:** Only the `user` table is affected (uses `updatedAt`). All other tables with `trg_updated_at_*` triggers use `updated_at` (snake_case) and work correctly. The `user` table's trigger was dropped as a workaround.

### 4.4 Functions in production (6 total)

| Function | Purpose | Status |
|----------|---------|--------|
| `hamafx_provision_personal_organization()` | AFTER INSERT on `user` → creates org + membership | ✅ |
| `hamafx_resolve_tenant_id(p_user_id text)` | Returns `COALESCE(current_setting('app.current_tenant', true), p_user_id)` | ✅ |
| `hamafx_set_tenant_id_from_user()` | Sets `tenant_id` from GUC or `user_id` on INSERT/UPDATE | ✅ |
| `hamafx_set_chat_message_tenant_id()` | Sets `tenant_id` from GUC or parent `chat_threads.tenant_id` | ✅ |
| `hamafx_set_decision_signal_outcome_tenant_id()` | Sets `tenant_id` from GUC or parent `decision_signals.tenant_id` | ✅ |
| `update_updated_at()` | Auto-updates `updated_at` on raw SQL updates | ❌ **BROKEN** |

---

## 5. RLS & Tenant Isolation Analysis

### 5.1 RLS status by table

| RLS Status | Count | Tables |
|-----------|-------|--------|
| **ENABLED + FORCED + `tenant_isolation` policy** | 25 | agent_opinions, alerts, audit_logs, bot_links, briefings_emitted, chat_messages, chat_telemetry, chat_threads, chat_tool_telemetry, daily_ai_spend, decision_signal_feedback, decision_signal_outcomes, decision_signals, journal_entries, memory_embeddings, notification_noise_state, portfolio_positions, portfolio_settings, provider_tests, push_subscriptions, rate_limits, shared_snapshots, user_sessions, user_settings, user_symbols |
| **ENABLED + FORCED + NO policy** 🔴 | 2 | `account`, `session` — **all access blocked for non-BYPASSRLS roles** |
| **DISABLED (global/shared)** | 21 | candles_1m, cot_reports, cron_runs, diagnostic_traces, economic_events, feature_flags, intermarket_resonance, ipn_events, live_ticks, news_articles, news_embeddings, organization, organization_member, payments, plans, provider_throttle, snapshots, subscriptions, symbol_catalog, user, verificationToken |

### 5.2 Critical: `account` and `session` have FORCE RLS with zero policies

Migration 0038 enabled + forced RLS on `account`/`session` and tried to create a `tenant_isolation` policy, but both tables have **no `tenant_id` column**, so `CREATE POLICY ... USING (tenant_id = ...)` failed silently. Result: `relrowsecurity = true`, `relforcerowsecurity = true`, **zero policies** → all rows invisible to non-BYPASSRLS roles.

Migration 0039 was supposed to fix this (`DROP POLICY IF EXISTS ...; ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) but **0039 was never applied to prod** (see §6).

**Current mitigation:** The app connects via the `postgres` role (`rolbypassrls = true`), so it can still read/write `account`/`session`. The `hamafx_admin` role also has BYPASSRLS. But Supabase's `authenticated` and `anon` roles do NOT — any query through those roles returns zero rows.

### 5.3 The `tenant_isolation` policy pattern (all 25 tables)

```sql
CREATE POLICY tenant_isolation ON <table> FOR ALL
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
```

- SELECT/UPDATE/DELETE: only rows where `tenant_id` matches the `app.current_tenant` GUC
- INSERT/UPDATE: new row's `tenant_id` must match the GUC
- When `app.current_tenant` is unset: `current_setting(..., true)` returns NULL → **zero rows returned**
- BYPASSRLS roles (`postgres`, `hamafx_admin`): policies bypassed entirely

The app sets `app.current_tenant` via `withTenantDb()` in `packages/db/src/client.ts` — but ONLY when `HAMAFX_ENABLE_RLS === 'true'`.

### 5.4 `tenant_id` column audit: Drizzle schema vs production

| Category | Tables | Schema has `tenant_id`? | Prod has `tenant_id`? | Prod default |
|----------|--------|------------------------|----------------------|-------------|
| **Tenant-scoped (both agree)** | 25 tables | ✅ NOT NULL, default `current_setting(...)` | ✅ NOT NULL | _(none — relies on trigger)_ |
| **Billing (both agree)** | payments, subscriptions | ✅ NOT NULL, default `current_setting(...)` | ✅ NOT NULL | `current_setting(...)` ✅ |
| **Global/shared (drift!)** | candles_1m, cot_reports, cron_runs, economic_events, intermarket_resonance, live_ticks, news_articles, news_embeddings, snapshots, symbol_catalog | ❌ No | ✅ Yes (nullable) | `'__system__'::text` |
| **Special case** | user_symbols | ✅ default `current_setting(...)` | ✅ NOT NULL | `'__system__'::text` (mismatch) |

**Key drift:** 10 global/shared tables have `tenant_id` in prod (nullable, default `'__system__'`) that the Drizzle schema does NOT define. A `drizzle-kit push` would **DROP these columns**, losing the `__system__` tenant marker.

### 5.5 Tables with RLS but missing DB-level tenant_id defaults

Of the 25 tenant-scoped tables with RLS, **23 have NO database-level default** on `tenant_id` (only `payments` and `subscriptions` have `current_setting(...)` as a DB default). The Drizzle schema defines `.default(sql\`current_setting('app.current_tenant', true)\`)`, but this is an ORM-layer default, NOT a database default.

**Risk:** If a row is inserted via raw SQL without setting `tenant_id` and the trigger doesn't fire, the insert fails with NOT NULL violation. The triggers currently cover all 25 tables, so this is a **latent risk** — the triggers are load-bearing for data insertion.

---

## 6. Migration Tracking Analysis

### 6.1 The tracking table situation

| Location | Exists? | Rows | Notes |
|----------|---------|------|-------|
| `public.__drizzle_migrations` | ❌ Does NOT exist | 0 | Prompt's assertion confirmed — no tracking table in `public` |
| `drizzle.__drizzle_migrations` | ✅ Exists | 24 | In the `drizzle` schema (drizzle-orm's default migrations schema) |
| `auth.schema_migrations` | ✅ Exists | 77 | Supabase Auth's own tracking (unrelated to Drizzle) |
| `storage.migrations` | ✅ Exists | 61 | Supabase Storage's own tracking (unrelated) |

The `drizzle.config.ts` does **NOT** set `migrationsSchema`. Drizzle-orm's migrator defaults to the `drizzle` schema when no explicit schema is configured. The `migrate-status.mjs` script queries `"__drizzle_migrations"` without schema qualification, which resolves to `public` (empty) — so it reports all 42 as pending. **The `migrate-status.mjs` script is broken** — it should query `drizzle.__drizzle_migrations`.

### 6.2 SHA-256 hash comparison: which migrations are applied?

Each migration file's SHA-256 was computed and compared against the 24 hashes in `drizzle.__drizzle_migrations`:

| Migration | Current hash | In tracking? | Status |
|-----------|-------------|-------------|--------|
| 0000–0006 | (match rows 1–7) | ✅ | Applied, unchanged |
| 0007 | `a6a642...` | ❌ (row 8 = `79aae4...`) | **File EDITED since application** — hash mismatch |
| 0008–0020 | (match rows 9–21) | ✅ | Applied, unchanged |
| 0021 | `c0dbe5...` | ❌ (row 22 = `5b989a...`) | **File EDITED since application** — hash mismatch |
| 0022 | `42f032...` | ✅ Row 23 | Applied, unchanged |
| 0023–0039 | (none match) | ❌ | **PENDING** — never applied (17 migrations) |
| 0040 | `6867fe...` | ❌ (row 24 = `c81a3a...`) | **File EDITED since application** — hash mismatch |
| 0041 | `f3c3c5...` | ❌ | **PENDING** — never applied |

### 6.3 Summary of tracking state

- **22 migrations** applied and unchanged (0000–0006, 0008–0020, 0022)
- **3 migrations** applied but file edited since (0007, 0021, 0040) — hash mismatch → drizzle-kit will try to **RE-APPLY**
- **17 migrations** never applied / pending (0023–0039, 0041)

### 6.4 The `scripts/predeploy-migrate.mjs` script

**Location:** `/home/ubuntu/HamaFX-Ai/scripts/predeploy-migrate.mjs`

**What it does:**
- Runs on every Vercel production deploy (wired into buildCommand: `node scripts/predeploy-migrate.mjs && npx turbo run build --filter=@hamafx/web`)
- Skips on preview deployments (`VERCEL_ENV !== 'production'`)
- Selects DB URL: `DIRECT_URL` → `POSTGRES_URL_NON_POOLING` → `DATABASE_URL` → `POSTGRES_URL` (prefers direct/non-pooled for DDL)
- Runs `pnpm --filter @hamafx/db migrate:apply` → `drizzle-kit migrate`
- If migration fails, deploy fails (exit 1)

**Current env:** `.env.production.local` defines `POSTGRES_URL` + `POSTGRES_URL_NON_POOLING` (NOT `DIRECT_URL`). Predeploy uses `POSTGRES_URL_NON_POOLING` (direct, port 5432) — correct for DDL.

### 6.5 CRITICAL: Next predeploy will FAIL and block the deploy

The next Vercel production deploy triggers `drizzle-kit migrate`, which will:
1. Read the journal (42 entries)
2. Compute SHA-256 of each migration file
3. Query `drizzle.__drizzle_migrations` (24 hashes found)
4. Attempt to apply migrations whose hashes are NOT in the tracking table

It will attempt to apply (in journal order):
- **0021** (re-apply, hash mismatch) → `ALTER TABLE "user_settings" ADD COLUMN "custom_instructions"` → 🟥 **FAIL: column already exists** → **DEPLOY BLOCKED**

Migration 0021 uses non-idempotent `ALTER TABLE ADD COLUMN` without `IF NOT EXISTS`. The columns already exist in prod (confirmed). Even if 0021 were fixed, 0023–0039, 0041 would also be attempted — many use non-idempotent DDL (`CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE` without `IF NOT EXISTS`) that will fail on existing objects.

### 6.6 Root cause: Supabase pooler silently dropped DDL

Migration 0041's comment explains: "The Supabase pooler silently dropped DDL from migrations 0035–0040 because PgBouncer in transaction mode doesn't support ALTER TABLE / CREATE TABLE inside transactions."

Drizzle-kit wraps each migration in a transaction. PgBouncer's transaction mode (port 6543) doesn't support DDL within pooled transactions. When migrations ran through the pooler, the DDL was silently dropped. The `predeploy-migrate.mjs` was later fixed to prefer `POSTGRES_URL_NON_POOLING` (direct, port 5432), but the damage was done — migrations 0023–0041 were never successfully recorded as applied.

---

## 7. Risk Assessment

### 7.1 Critical risks (act immediately)

| # | Risk | Impact | Probability |
|---|------|--------|-------------|
| C1 | **Next predeploy will fail at migration 0021** (hash mismatch → re-apply → `ADD COLUMN` fails on existing column) | 🟥 Deploy blocked — no new code can ship to prod until resolved | **Certain** on next prod deploy |
| C2 | **`drizzle-kit push` would drop `tenant_id` from 10 global tables** + `symbol_catalog.n_data_symbol` | 🟥 Data loss — `__system__` tenant markers lost, `n_data_symbol` provider mapping lost | High if someone runs push |
| C3 | **`account`/`session` have FORCE RLS + zero policies** | 🟥 All access blocked for `authenticated`/`anon` roles (app works via `postgres` BYPASSRLS) | Active — currently mitigated by BYPASSRLS |

### 7.2 High risks

| # | Risk | Impact | Probability |
|---|------|--------|-------------|
| H1 | **`update_updated_at()` function is broken** (hardcodes `NEW.updated_at`, fails on `user.updatedAt`) | 🟠 `user` table can't have auto-updating trigger; `updatedAt` not auto-maintained by DB triggers | Active |
| H2 | **17 pending migrations (0023–0039, 0041) use non-idempotent DDL** | 🟠 Even after fixing 0021, subsequent migrations will fail on existing tables/indexes/constraints | High on next deploy |
| H3 | **`feature_flags` and `diagnostic_traces` have no migration files** | 🟠 `drizzle-kit generate` will emit `CREATE TABLE` for existing tables → migration fails | Medium (only when generating new migrations) |
| H4 | **22 tenant tables missing DB-level `tenant_id` default** | 🟠 Raw SQL inserts without trigger fire → NOT NULL violation | Low (triggers cover all tables) |
| H5 | **`migrate-status.mjs` script is broken** (queries wrong schema) | 🟠 Developers can't accurately check migration status | Active |

### 7.3 Medium risks

| # | Risk | Impact | Probability |
|---|------|--------|-------------|
| M1 | `user_symbols.tenant_id` default mismatch (`'__system__'` vs `current_setting(...)`) | 🟡 Push would change default behavior | Medium |
| M2 | `diagnostic_traces` has extra columns (`summary`, `metadata`, `created_at`) not in schema | 🟡 Push would drop them; data loss if populated | Low (0 rows currently) |
| M3 | `diagnostic_traces` index name mismatch (`diagnostic_traces_*` vs `diag_traces_*`) | 🟡 Push would try to create duplicate indexes | Low |
| M4 | Duplicate FTS index on `news_articles` (`news_fts_idx` + `news_articles_fts_idx`) | 🟡 Wasted storage, no functional impact | Active |
| M5 | `journal_entries.user_id`, `memory_embeddings.user_id`, `shared_snapshots.user_id` have `'__system__'` default in prod but not in schema | 🟡 Push would remove defaults | Low |

### 7.4 Destructive operations in migration files

| Migration | Operation | Risk |
|-----------|-----------|------|
| 0009 | `DROP TABLE IF EXISTS "onchain_signals" CASCADE` | Low — table already dropped, idempotent |
| 0009 | `ALTER TABLE "briefings_emitted" DROP CONSTRAINT "briefings_emitted_event_id_kind_pk"` | Low — already dropped, idempotent |
| 0027 | `DROP INDEX IF EXISTS "provider_tests_user_provider_idx"` | Low — idempotent |
| 0029 | `DROP INDEX IF EXISTS "idx_agent_opinions_thread"`, `"idx_agent_opinions_user_created"`, `"chat_telemetry_user_id_idx"` | Low — idempotent |
| 0035 | `DROP TRIGGER IF EXISTS hamafx_user_personal_organization_after_insert` | Low — idempotent |
| 0036 | `DROP INDEX IF EXISTS "candles_1m_symbol_t_idx"` | Low — idempotent |
| 0039 | `DROP TRIGGER IF EXISTS trg_updated_at_*` (7 triggers), `DROP FUNCTION update_updated_at()` | 🟠 **Non-idempotent if re-applied** — would drop working triggers before recreating them |
| 0040 | `DROP TRIGGER IF EXISTS trg_updated_at_plans/subscriptions/payments` | Low — idempotent |

### 7.5 Data-loss scenarios from naive `drizzle-kit push`

| Action | What happens | Data loss? |
|--------|-------------|------------|
| `drizzle-kit push` | Syncs schema → DB by diffing. Drops columns/tables not in schema. | 🟥 **YES** — drops `tenant_id` from 10 global tables, `n_data_symbol` from `symbol_catalog`, `summary`/`metadata`/`created_at` from `diagnostic_traces` |
| `drizzle-kit push --force` | Same but skips confirmations | 🟥 **YES** — same as above |
| `drizzle-kit migrate` (via predeploy) | Applies pending migrations in order | 🟠 Fails at 0021 (non-idempotent), blocks deploy. No data loss but no progress either. |

---

## 8. Recommended Reconciliation Strategy

> ⚠️ **READ ONLY review — these are recommendations only. Do not execute without explicit approval.**
> All steps should be tested against a staging/branch DB first, and prod should be backed up before any DDL.

### Phase 0: Immediate — unblock deploys (do this FIRST)

**Step 1: Back up production**
```bash
# Take a Supabase snapshot or pg_dump before any changes
pg_dump "postgres://postgres:...@db.cxljcbrygnkobqnyxxeg.supabase.co:5432/postgres" \
  --schema=public --no-owner --no-privileges > backup_pre_recon.sql
```

**Step 2: Fix the `drizzle.config.ts` to pin `migrationsSchema`**
Add `migrationsSchema: 'drizzle'` to `drizzle.config.ts` so drizzle-kit consistently reads/writes the tracking table in the `drizzle` schema:
```typescript
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  migrationsSchema: 'drizzle',  // ← ADD THIS
  // ...
});
```

**Step 3: Manually insert the 3 edited-file hashes into `drizzle.__drizzle_migrations`**
This prevents drizzle-kit from re-applying 0007, 0021, and 0040 (whose file contents changed since application but whose DDL effects are already in prod):
```sql
-- Insert the CURRENT file hashes for 0007, 0021, 0040 so drizzle-kit skips them
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('a6a6423b89df48f301690d312c8284c2955fef5f810c55eeb10dff058a718db2', extract(epoch from now())*1000),  -- 0007
  ('c0dbe515f5b31824b94b0a1b99e0d4fbac7856be071fd19e843bc120f2ce2814', extract(epoch from now())*1000),  -- 0021
  ('6867fed776b187e985e5cae99e6f5f7a862cd8b2ab231e1d3ba6d42dea93a24d', extract(epoch from now())*1000);  -- 0040
```
> ⚠️ **Verify these hashes match the current files** before inserting. They were computed in this review from the files on disk.

**Step 4: Create a "reconciliation" migration (0042) that manually applies all pending DDL idempotently**
Since migrations 0023–0039, 0041 contain DDL that is already partially reflected in prod (via manual fixes + pooler partial-applies), the safest approach is a single idempotent "catch-up" migration that uses `IF NOT EXISTS` / `DO $ ... IF NOT EXISTS ...` for every operation. After applying it, manually insert its hash into the tracking table, then mark 0023–0041 as applied (by inserting their current hashes) since their effects are now fully present.

This avoids re-running the non-idempotent originals. The reconciliation migration should cover:
- All `CREATE TABLE IF NOT EXISTS` for tables from 0023–0041
- All `ALTER TABLE ADD COLUMN IF NOT EXISTS` for columns from 0023–0041
- All `CREATE INDEX IF NOT EXISTS` for indexes from 0023–0041
- All `DO $ ... IF NOT EXISTS ... $` for constraints, enums, RLS, policies, triggers, functions
- The `update_updated_at()` function fix (column-name-agnostic version from 0039/0041)
- The `trg_updated_at_user` trigger re-creation (now safe with the fixed function)
- RLS disable on `account`/`session` (the 0039 fix)

**Step 5: Mark migrations 0023–0041 as applied in the tracking table**
After the reconciliation migration confirms all DDL is present, insert the current file hashes for 0023–0041 into `drizzle.__drizzle_migrations` so drizzle-kit skips them on future deploys:
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT hash, extract(epoch from now())*1000 FROM (VALUES
  ('a4b42fe3297ede68b0a45a819a37d6e4da7165a708de9d2baa1a0332416a6aec'),  -- 0023
  ('9a22c40e269de577753b94e184267422615f2fbe3b33ae00528295e1e09c26b7'),  -- 0024
  -- ... 0025 through 0041
  ('f3c3c53111ee59b950359f04be5a03d0addc798d139fdda21ac652b17d69f1f7')   -- 0041
) AS t(hash);
```

**Step 6: Fix the `migrate-status.mjs` script**
Change the query to use `drizzle.__drizzle_migrations` and compare hashes correctly (the script currently compares `hash` to `tag`, which never matches):
```javascript
const rows = await sql`SELECT hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id`;
```

### Phase 1: Fix the trigger function and RLS (after Phase 0)

**Step 7: Fix `update_updated_at()` function**
Replace the broken 0040 version with the column-name-agnostic version from 0039/0041:
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $
DECLARE col_name text;
BEGIN
  SELECT column_name INTO col_name
  FROM information_schema.columns
  WHERE table_schema = TG_TABLE_SCHEMA AND table_name = TG_TABLE_NAME
    AND column_name IN ('updated_at', 'updatedAt') LIMIT 1;
  IF col_name = 'updated_at' THEN NEW.updated_at = now();
  ELSIF col_name = 'updatedAt' THEN NEW."updatedAt" = now(); END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;
```

**Step 8: Re-create `trg_updated_at_user` trigger** (now safe with fixed function):
```sql
CREATE TRIGGER trg_updated_at_user BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Step 9: Disable RLS on `account` and `session`** (the 0039 fix):
```sql
DROP POLICY IF EXISTS tenant_isolation ON account;
ALTER TABLE account NO FORCE ROW LEVEL SECURITY;
ALTER TABLE account DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON session;
ALTER TABLE session NO FORCE ROW LEVEL SECURITY;
ALTER TABLE session DISABLE ROW LEVEL SECURITY;
```

### Phase 2: Reconcile schema drift (after Phase 1)

**Step 10: Add `n_data_symbol` to the Drizzle schema** so push/generate don't drop it. Add to `packages/db/src/schema/symbol-catalog.ts`:
```typescript
nDataSymbol: text('n_data_symbol'),
```

**Step 11: Create migration files for `feature_flags` and `diagnostic_traces`** — idempotent `CREATE TABLE IF NOT EXISTS` matching their current prod structure.

**Step 12: Decide on `tenant_id` for the 10 global tables** — either add `tenantId` to the Drizzle schema (recommended, with `.default(sql\`'__system__'\`)` and nullable) or remove from prod if unused.

**Step 13: Align `diagnostic_traces` schema** — add `summary`, `metadata`, `created_at` to the Drizzle schema, or remove from prod (currently 0 rows).

**Step 14: Remove duplicate FTS index** — `DROP INDEX IF EXISTS "news_articles_fts_idx"` (keep `news_fts_idx`).

---

## 9. Prevention Recommendations

1. **Never run `drizzle-kit push` against production** — it performs destructive diff-based syncs that drop columns/tables not in the schema. Use `drizzle-kit generate` + `drizzle-kit migrate` exclusively.
2. **Always use the direct connection for migrations** — set `DIRECT_URL` explicitly in Vercel prod env. Never run migrations through the Supabase pooler (port 6543) — PgBouncer transaction mode silently drops DDL.
3. **Pin `migrationsSchema: 'drizzle'` in `drizzle.config.ts`** — prevents the tracking table from landing in an unexpected schema.
4. **Make all migrations idempotent** — use `IF NOT EXISTS` / `IF EXISTS` / `DO $ ... IF NOT EXISTS ... $` guards. Add a CI check that applies each migration twice against PGlite to verify idempotency.
5. **Never edit applied migration files** — editing changes the SHA-256 hash, causing drizzle-kit to re-apply. Create a NEW migration to fix issues. Add a CI check that verifies no tracked migration hashes have changed.
6. **Add a schema-drift CI check** — extend `packages/db/test/schema-drift.test.ts` to compare Drizzle schema vs PGlite with all migrations applied. Run on every PR touching `packages/db/`.
7. **Generate a migration for every schema change** — never create tables/columns manually in prod. Always run `pnpm --filter @hamafx/db migrate:gen` after schema changes.
8. **Fix the `migrate-status.mjs` script** — query `drizzle.__drizzle_migrations` (not `public`), compute file hashes for comparison (don't compare hash to tag).
9. **Add a predeploy safety check** — before `drizzle-kit migrate`, verify no applied migration file has been edited (hash mismatch). Fail with a clear message if detected.
10. **Regular schema-diff audits** — run a monthly comparison between Drizzle schema and prod to catch drift early.

---

## Appendix A: Production DB Statistics

| Metric | Value |
|--------|-------|
| PostgreSQL version | 17.6 |
| Total tables in `public` | 48 |
| Total columns in `public` | 483 |
| Total indexes in `public` | 134 |
| Total constraints in `public` | 126 |
| Total triggers in `public` | 14 |
| Total functions in `public` | 6 |
| Total enum types | 20 (60 labels) |
| Total RLS policies | 25 |
| Tables with RLS enabled | 27 (25 with policy + 2 without) |
| Extensions | 6 (vector, pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault, plpgsql) |
| Largest table | `candles_1m` (~24,076 rows) |
| Migrations in journal | 42 |
| Migrations recorded as applied | 24 |
| Migrations pending | 18 (17 never applied + 3 hash mismatches - 2 already counted) |

## Appendix B: Files Reviewed

- All 42 migration SQL files: `packages/db/drizzle/0000_*.sql` through `0041_*.sql`
- Drizzle config: `packages/db/drizzle.config.ts`
- Migration journal: `packages/db/drizzle/meta/_journal.json`
- All 30 schema files: `packages/db/src/schema/*.ts`
- Predeploy script: `scripts/predeploy-migrate.mjs`
- Status script: `packages/db/scripts/migrate-status.mjs`
- DB client: `packages/db/src/client.ts`
- Schema drift test: `packages/db/test/schema-drift.test.ts`
- DB package config: `packages/db/package.json`
- Production DB (live query via psql): tables, columns, enums, triggers, policies, indexes, constraints, functions, extensions, row counts

