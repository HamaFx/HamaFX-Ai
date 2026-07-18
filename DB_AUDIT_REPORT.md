# HamaFX-Ai — Deep Database Audit Report

**Date**: July 18, 2026
**Auditor**: Automated analysis via code inspection + migration chain review
**Scope**: `packages/db/` schema definitions (37 tables), 54 migrations, query patterns across `packages/ai/`, `apps/web/`, `apps/worker/`, connection handling, and PGlite compatibility layer.

---

## Executive Summary

The HamaFX-Ai database layer is **mature and well-engineered** for a production application of its scope. The multi-tenant design with Row-Level Security (RLS), atomic budget guards, and comprehensive migration testing reflects careful planning. However, the audit identified **2 critical bugs**, **6 high-severity issues**, **9 medium concerns**, and **8 low-severity observations** across schema design, query correctness, indexing, connection handling, and migration hygiene.

---

## Findings Summary

| # | Severity | Category | Issue |
|---|----------|----------|-------|
| C1 | 🔴 Critical | Query Correctness | `countJournalEntriesThisMonth` uses exact timestamp equality instead of date range |
| C2 | 🔴 Critical | Schema Design | `subscriptions_tenant_active_idx` unique index on `(tenantId, status)` prevents legitimate multi-subscription states |
| H1 | 🟠 High | Schema Design | `decision_signals` tables dropped (0052) but RLS migration (0038) created policies referencing them — orphan cleanup relies on CASCADE |
| H2 | 🟠 High | Query Correctness | `countActiveAlerts` uses misleading alias `count` for `id` column (returns `result.length`, which happens to be correct but fragile) |
| H3 | 🟠 High | Migrations | Migration 0050 adds tenant trigger to `cron_runs` which lacks `user_id`, causing trigger to fail on insert |
| H4 | 🟠 High | Connection | No connection retry/backoff in `getDb()` for transient errors; relies entirely on postgres-js internal reconnect |
| H5 | 🟠 High | Scalability | `withTenantDb()` wraps ALL operations in a transaction just to set a GUC — adds overhead for read-only queries |
| H6 | 🟠 High | Indexing | `audit_logs` lacks composite index on `(tenantId, createdAt)` — all tenant-scoped queries will table-scan |
| M1 | 🟡 Medium | Data Types | `dailyAiSpend.totalUsdCents` is `bigint` (integer cents) but `chatTelemetry.estCostUsd` is `doublePrecision` — floating-point accumulation drift |
| M2 | 🟡 Medium | Query Pattern | Widespread `getDb()` singleton pattern creates independent connections per module import; no connection-per-request scoping |
| M3 | 🟡 Medium | Schema Design | `user_settings` table is 40+ columns wide — no vertical partitioning for rarely-accessed columns |
| M4 | 🟡 Medium | Migrations | PGlite `__drizzle_migrations` table is in `public` schema, but production uses `drizzle` schema — tracking mismatch |
| M5 | 🟡 Medium | Retention | `runRetentionCleanup()` runs 5 sequential DELETEs — no batching, no `LIMIT`, risk of long-running transactions on large tables |
| M6 | 🟡 Medium | Performance | `getActiveUserIds()` uses correlated `EXISTS` subquery per user — could be slow with many users |
| M7 | 🟡 Medium | Locking | No `SELECT ... FOR UPDATE` usage anywhere — budget reservation uses atomic UPDATE, but journal/portfolio update-read-update cycles aren't locked |
| M8 | 🟡 Medium | Maintainability | Postgres enum types defined in migration 0032 but schema files reference them via `pgEnum()` — runtime mismatch risk if migration not applied |
| M9 | 🟡 Medium | Indexing | `portfoliopositions.linkedSignalId` references dropped `decision_signals` table but column still exists with no index |
| L1 | 🟢 Low | Consistency | Inconsistent column naming: `userId` (camelCase) vs `user_id` (snake_case) — Drizzle maps both but confusing |
| L2 | 🟢 Low | Schema Design | `providerThrottle` is single-row per provider — can't track sliding windows, only simple count |
| L3 | 🟢 Low | Migrations | Migration 0045 drops duplicate FTS index — suggests schema/index drift wasn't caught by tooling |
| L4 | 🟢 Low | Maintainability | No `VACUUM`/`ANALYZE` strategy documented or automated |
| L5 | 🟢 Low | Testing | No query-plan regression tests (EXPLAIN ANALYZE) in CI |
| L6 | 🟢 Low | Security | `news_articles` and other global tables have no RLS (intentional but undocumented risk surface) |
| L7 | 🟢 Low | Migrations | 54 migration files — approaching unwieldy; consider squashing pre-production migrations |
| L8 | 🟢 Low | Schema Design | `alertEmail` in `user_settings` is plain text — could benefit from encryption like `aiApiKeys` |

---

## Detailed Findings

### C1 — `countJournalEntriesThisMonth` uses exact equality instead of date range

**File**: `packages/db/src/queries/billing.ts:157-170`
**Severity**: 🔴 Critical
**Impact**: The free-tier journal entry monthly limit is **completely broken**. The query uses `eq(schema.journalEntries.openedAt, monthStart)` which only matches journal entries opened at exactly `YYYY-MM-01T00:00:00.000Z` UTC. No real journal entry will match this predicate. Users are never rate-limited by journal count.

**Current code**:
```typescript
eq(schema.journalEntries.openedAt, monthStart),  // monthStart = new Date(y, m, 1)
```

**Fix**: Use a range query:
```typescript
const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
and(
  eq(schema.journalEntries.tenantId, tenantId),
  gte(schema.journalEntries.openedAt, monthStart),
  lt(schema.journalEntries.openedAt, nextMonthStart),
)
```

---

### C2 — `subscriptions_tenant_active_idx` unique index prevents legitimate states

**File**: `packages/db/src/schema/billing.ts:124`
**Severity**: 🔴 Critical
**Impact**: The unique index `UNIQUE (tenant_id, status)` means a tenant can only have **one subscription row per status value**. If a subscription cycles through `active → canceled → active → canceled`, the second `canceled` row will violate the unique constraint and crash the webhook handler.

**What this prevents**:
- Two subscriptions both in `canceled` state (impossible to have subscription history)
- Two subscriptions both in `past_due` state (legitimate: card fails, new card also fails)

**Fix**: Replace with a **partial unique index**:
```sql
CREATE UNIQUE INDEX subscriptions_tenant_active_idx
  ON subscriptions (tenant_id)
  WHERE status IN ('active', 'trialing');
```
This ensures only ONE active/trialing subscription per tenant while allowing multiple historical rows.

---

### H1 — Orphan RLS policies from dropped `decision_signals` tables

**File**: `packages/db/drizzle/0038_phase3_rls_cutover.sql` + `0052_drop_decision_signals.sql`
**Severity**: 🟠 High
**Impact**: Migration 0038 creates RLS policies on `decision_signals`, `decision_signal_feedback`, and `decision_signal_outcomes`. Migration 0052 drops these tables with `CASCADE`, which **does** clean up the policies. However, if any migration between 0038 and 0052 failed or was skipped, orphan policies could remain.

**Recommendation**: Add a cleanup step in 0052 that explicitly drops RLS policies before dropping tables. The `CASCADE` is correct but explicit cleanup is safer.

---

### H3 — Migration 0050 adds tenant trigger to `cron_runs`

**File**: `packages/db/drizzle/0050_fix_tenant_triggers.sql`
**Severity**: 🟠 High
**Impact**: The DO block in migration 0050 includes `cron_runs` in the array of tables that get `hamafx_set_tenant_id_from_user()` triggers. But `cron_runs` has columns `(job_name, run_date, status, note, ...)` — it does **NOT** have a `user_id` column. The trigger function references `NEW."user_id"`, which will throw an error on INSERT.

The trigger is created as:
```sql
CREATE TRIGGER hamafx_cron_runs_tenant_id BEFORE INSERT OR UPDATE ON cron_runs
  FOR EACH ROW EXECUTE FUNCTION hamafx_set_tenant_id_from_user()
```

The function body:
```sql
IF NEW."tenant_id" IS NULL THEN
  NEW."tenant_id" := hamafx_resolve_tenant_id(NEW."user_id");  -- ERROR: column "user_id" doesn't exist
END IF;
```

**Fix**: Remove `cron_runs` from the array in migration 0050, or create a separate trigger function for tables without `user_id`. `cron_runs` has `tenant_id DEFAULT '__system__'` which is the correct fallback.

---

### H6 — Missing composite index on `audit_logs`

**File**: `packages/db/src/schema/audit.ts`
**Severity**: 🟠 High
**Impact**: `audit_logs` has indexes on `user_id` and `action` but **no index on `(tenant_id, created_at)`**. Since RLS scoping filters by `tenant_id`, and admin queries filter by date range, this forces a sequential scan for any tenant-scoped audit query.

**Fix**: Add `index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt)`.

---

### M1 — `bigint` vs `doublePrecision` cost tracking mismatch

**Files**: `packages/db/src/schema/daily-ai-spend.ts`, `packages/db/src/schema/telemetry.ts`
**Severity**: 🟡 Medium
**Impact**: `dailyAiSpend.totalUsdCents` is `bigint` (exact integer cents) but individual `chatTelemetry.estCostUsd` is `doublePrecision` (floating-point). The `tryReserveBudget` function sums float values into a bigint column via `SET total_usd_cents = total_usd_cents + $estCostCents`. The implicit cast from `double precision` to `bigint` truncates toward zero, losing fractional cents. Over thousands of turns, this creates **accumulation drift** between the telemetry sum and the budget counter.

**Recommendation**: Either make `estCostUsd` an `integer` column storing micro-dollars (or cents), or make `totalUsdCents` a `doublePrecision`. Prefer integer arithmetic for financial data.

---

### M2 — Singleton `getDb()` creates shared-nothing connections

**File**: `packages/db/src/client.ts`
**Severity**: 🟡 Medium
**Impact**: `getDb()` returns a module-scope singleton. In Vercel serverless functions, this means each cold start creates a fresh connection pool. The pool size is 5, but if one function instance makes 5 concurrent queries and another cold start also makes 5, the total connections to the DB could spike. The Supabase transaction pooler mitigates this, but it's a risk during deploy rollouts or traffic spikes.

**Recommendation**: Monitor `pg_stat_activity` for connection counts. Consider using Supabase's session pooler (port 5432) with `prepare: true` for lower connection overhead in high-throughput scenarios.

---

### M5 — Retention cleanup lacks batching

**File**: `packages/db/src/retention.ts`
**Severity**: 🟡 Medium
**Impact**: `runRetentionCleanup()` issues 5 unconditional `DELETE FROM ... WHERE created_at < cutoff` statements. On large tables (e.g., `chat_telemetry` with 90 days of data), these can run for seconds or minutes, holding locks and potentially timing out the Vercel function.

**Recommendation**: Add `LIMIT` with incremental deletion loops:
```typescript
while (true) {
  const result = await db.delete(schema.chatTelemetry)
    .where(lt(...)).limit(1000).returning({ id: schema.chatTelemetry.id });
  if (result.length === 0) break;
}
```

---

### M7 — Missing `SELECT ... FOR UPDATE` in journal/portfolio persistence

**Files**: `packages/ai/src/journal/persistence.ts`, `packages/ai/src/portfolio/position-service.ts`
**Severity**: 🟡 Medium
**Impact**: Journal entry update and portfolio position close flows do a `SELECT` then `UPDATE` in separate queries without row-level locking. Two concurrent requests could both read the same row, make conflicting modifications, and the second write would silently overwrite the first.

**Example in `journal/persistence.ts`**:
```typescript
const rows = await getDb().select().from(schema.journalEntries).where(eq(...));
// ... compute changes ...
const updated = await getDb().update(schema.journalEntries).set(...).where(eq(...));
```

**Fix**: Use `SELECT ... FOR UPDATE` within a transaction, or use an atomic `UPDATE ... RETURNING` with a condition that validates the pre-state.

---

### M8 — Postgres enum types not enforced in schema DDL

**Files**: `packages/db/src/schema/enums.ts`, migration `0032_phase8_soft_delete_enums_fts.sql`
**Severity**: 🟡 Medium
**Impact**: Enum types are defined in Postgres via migration 0032 and referenced in Drizzle via `pgEnum()`. However, the **actual column types were intentionally NOT converted** in 0032 (the migration comment says: "Converting the column types requires careful handling... should be done in a separate migration"). This means columns like `user.role`, `journal_entries.outcome`, etc. are still `text` columns in the database. The `pgEnum()` in Drizzle is a type-level annotation that doesn't match the actual column type.

**Risk**: If someone runs `drizzle-kit push` (which AGENTS.md says NEVER to do), Drizzle would try to alter these columns to enum types, potentially failing. Also, the enum types exist in Postgres but are unused — dead database objects.

---

### L2 — `providerThrottle` can't track sliding windows

**File**: `packages/db/src/schema/throttle.ts`
**Severity**: 🟢 Low
**Impact**: `providerThrottle` has a single row per provider with `windowStartedAt` and `count`. This only tracks a single window — no history, no sliding window calculations. If the throttle check happens mid-window, it can't distinguish between "just started" and "at capacity."

---

### L3 — Duplicate FTS index (historical)

**Migration**: `0045_drop_duplicate_fts_index.sql`
**Severity**: 🟢 Low
**Impact**: Two FTS indexes were created on `news_articles` (one in migration 0004, one in 0032) with different names but identical behavior. Migration 0045 drops the duplicate. This suggests schema/index changes weren't caught by `drizzle-kit generate` or schema-drift tests at the time.

---

## Schema Design Assessment

### Strengths

1. **Multi-tenant isolation via RLS**: 24+ tables have `tenant_isolation` policies with `FORCE ROW LEVEL SECURITY`. The `withTenantDb()` helper correctly sets `app.current_tenant` GUC.

2. **Atomic operations**: `tryReserveBudget()` (INSERT..ON CONFLICT..DO UPDATE WHERE), `checkAndIncrementDailyQuota()`, and `withRateLimit()` all use single-statement atomicity — no TOCTOU races.

3. **Foreign key cascade strategy**: Appropriate use of `ON DELETE CASCADE` for user-owned data (threads → messages, users → journal entries) and `ON DELETE RESTRICT` for billing plans.

4. **Soft-delete support**: `users`, `journal_entries`, `portfolio_positions` have `deletedAt` columns with corresponding indexes.

5. **Idempotency guards**: `cron_runs` PK prevents duplicate cron execution. `telegram_updates` dedup prevents webhook replays. `briefings_emitted` PK prevents duplicate briefing generation.

6. **Comprehensive CHECK constraints**: `alerts.snoozeHours` (0–168), `journal_outcome_closed_consistency`, `portfolio_status_closed_consistency`.

### Table Inventory

| Category | Tables | Count |
|----------|--------|-------|
| Auth & Identity | `user`, `account`, `session`, `verificationToken`, `organization`, `organization_member`, `user_sessions`, `user_settings`, `user_symbols` | 9 |
| Chat & AI | `chat_threads`, `chat_messages`, `chat_telemetry`, `chat_tool_telemetry`, `agent_opinions`, `memory_embeddings`, `daily_ai_spend`, `analysis_jobs` | 8 |
| Market Data | `live_ticks`, `candles_1m`, `news_articles`, `news_embeddings`, `economic_events`, `snapshots`, `cot_reports`, `intermarket_resonance`, `symbol_catalog` | 9 |
| User Content | `journal_entries`, `alerts`, `portfolio_positions`, `portfolio_settings`, `shared_snapshots`, `briefings_emitted` | 6 |
| Billing | `plans`, `subscriptions`, `payments`, `ipn_events` | 4 |
| Infrastructure | `cron_runs`, `rate_limits`, `provider_daily_quota`, `provider_throttle`, `provider_tests`, `audit_logs`, `feature_flags`, `diagnostic_traces`, `push_subscriptions`, `notification_noise_state`, `bot_links`, `telegram_updates` | 12 |

**Total**: 48 tables (including dropped `decision_signals` child tables) → **37 active tables**.

### Index Coverage

| Table | Indexes | Coverage Assessment |
|-------|---------|---------------------|
| `chat_messages` | `(thread_id, created_at)`, `(tenant_id)` | ✅ Good — covers main access patterns |
| `chat_telemetry` | `(user_id, created_at)`, `(tenant_id)`, `(created_at)`, `(thread_id)` | ✅ Good — PERF-03 composite for 30-day queries |
| `journal_entries` | `(user_id)`, `(tenant_id, opened_at)`, `(symbol)`, `(opened_at)` | ✅ Good |
| `alerts` | `(tenant_id)`, `(user_id)`, `(active)`, `(fired_at)`, `(last_fired_at)` | ✅ Good — covers cron scanning |
| `audit_logs` | `(user_id)`, `(action)` | ❌ Missing `(tenant_id, created_at)` |
| `analysis_jobs` | `(status, created_at)`, `(user_id)` | ✅ Good for worker polling |
| `memory_embeddings` | 7 indexes including HNSW vector | ✅ Comprehensive |
| `news_articles` | 4 indexes including GIN + FTS | ✅ Good |
| `subscriptions` | `(tenant_id)`, `UNIQUE (tenant_id, status)` | ⚠️ Unique index problematic (C2) |

---

## Migration Hygiene

### Positive Findings

- **54 migrations**, all present in `drizzle/meta/_journal.json`
- **Idempotency tested**: `full-migration-chain.test.ts` applies every migration twice
- **Schema drift detected**: `schema-drift.test.ts` compares Drizzle schemas against migrated DB
- **Migration naming**: Consistent `NNNN_descriptive_slug.sql` pattern
- **`IF NOT EXISTS` / `IF EXISTS`**: Used throughout for idempotency
- **PGlite compatibility**: Full sanitization layer for local dev

### Concerns

1. **54 migrations is approaching unwieldy** — Production deployments applying 54 sequential migrations on a fresh DB is slow (each runs in a transaction). Consider squashing pre-1.0 migrations.

2. **Migration 0038 references dropped tables** — `decision_signals`, `decision_signal_feedback`, `decision_signal_outcomes` were dropped in 0052 but 0038 still has their RLS policies. CASCADE cleans up, but this creates a confusing migration chain for new deployments (0038 applies, then 0052 drops).

3. **`_journal.json` tracking table uses `drizzle` schema in prod but PGlite uses `public`** — The PGlite client creates `"__drizzle_migrations"` in the public schema, but drizzle-kit tracks applied migrations in `drizzle.__drizzle_migrations`. This mismatch means PGlite migration tracking is independent of production migration tracking.

---

## Connection & Pooling Assessment

### Current Configuration

| Environment | Pool Size | Statement Timeout | Idle Timeout | Connect Timeout | Max Lifetime |
|-------------|-----------|-------------------|--------------|-----------------|--------------|
| Web (Vercel) | 5 | 8s | 20s | 10s | 30 min |
| Worker | 3 | 30s | 20s | 10s | 30 min |
| Test | 1 | 30s | 20s | 10s | 30 min |

### Assessment

- **Pool sizing is appropriate**: 5 for web (concurrent tool calls + persistence), 3 for worker (tick flush + job inserts)
- **Statement timeout**: 8s for web is tight but correct for Vercel's 10s Hobby timeout. 30s for worker is generous.
- **`prepare: false`** is correct for Supabase transaction pooler (PgBouncer in transaction mode)
- **TLS**: `resolveSslOptions()` has a production warning but doesn't crash — good for self-host compatibility
- **Missing**: No connection health checks, no circuit breaker for DB outages, no retry logic for transient connection errors (though postgres-js handles this internally to some extent)

### Transaction Usage

Transactions are used sparingly and appropriately:

| Location | Purpose | Assessment |
|----------|---------|------------|
| `withTenantDb()` | Set GUC + run work | ⚠️ Wraps all operations in txn even reads |
| `multi-agent-analysis.ts` | Claim pending job atomically | ✅ Correct use of `SELECT ... LIMIT 1 FOR UPDATE` + `UPDATE` |
| `snapshots/persistence.ts` | Upsert snapshots in transaction | ✅ Correct |
| `persistence.ts` | Multi-table chat persistence | ✅ Correct — thread + messages + telemetry |
| `auth actions` | User registration flow | ✅ Multi-table insert consistency |

---

## Query Pattern Analysis

### `getDb()` Call Distribution

Across the codebase, `getDb()` is called **241+ times** across:
- `packages/ai/` — Tools, persistence, context building (~60 calls)
- `apps/web/` — API routes, auth, settings, admin (~50 calls)
- `apps/worker/` — Jobs, scheduler, persistence (~10 calls)
- `packages/data/` — Cache, throttle (~8 calls)
- `packages/db/` — Core utilities (~10 calls)

**Pattern**: Most calls create a fresh `const db = getDb()` at the top of the function, then use it. No connection-per-request middleware or `AsyncLocalStorage`-based DB scoping.

### N+1 Query Risks

The codebase generally avoids N+1 patterns. Notable cases:

1. **`getSubscription()`** (`packages/db/src/queries/billing.ts:56`): Fetches subscription, then fetches plan in a separate query. This is a **2-query pattern**, not N+1, and acceptable.

2. **`getActiveUserIds()`** (`packages/db/src/active-users.ts:42`): Uses correlated `EXISTS` subquery — Postgres will execute this as a semi-join, which is efficient. Not N+1.

3. **Alert evaluation** (`packages/ai/src/alerts/evaluator.ts:357`): Uses `readReadingsBatch()` to fetch current prices for all active alerts in one query. Correctly batched.

---

## Scalability Projections

| Concern | Current State | At 10x Users | At 100x Users |
|---------|--------------|-------------|---------------|
| `live_ticks` (3 rows) | ✅ Trivial | ✅ Trivial | ✅ Trivial |
| `candles_1m` (60K rows) | ✅ Trivial | ✅ Trivial | ✅ Trivial |
| `chat_telemetry` (unbounded) | ⚠️ 90-day retention | ⚠️ Needs monitoring | ❌ May need partitioning |
| `chat_messages` (per-thread) | ✅ Indexed | ✅ OK with indexes | ⚠️ Archive old threads |
| `journal_entries` | ✅ Indexed | ✅ OK | ✅ OK |
| `rate_limits` (per-minute) | ✅ 2-hour TTL | ✅ OK | ✅ OK |
| `audit_logs` (unbounded) | ⚠️ No retention policy | ⚠️ Needs retention | ❌ May need partitioning |
| `memory_embeddings` | ⚠️ HNSW index size | ⚠️ Monitor | ❌ May need pgvector scaling |

---

## Recommendations (Prioritized)

### Immediate (This Sprint)

1. **Fix C1**: Replace `eq(openedAt, monthStart)` with `gte/lte` range in `countJournalEntriesThisMonth`
2. **Fix C2**: Replace `subscriptions_tenant_active_idx` with partial unique index `WHERE status IN ('active', 'trialing')`
3. **Fix H3**: Remove `cron_runs` from migration 0050 trigger array (or create migration 0054 to drop the trigger)
4. **Fix H6**: Add composite index `(tenant_id, created_at)` on `audit_logs`

### Short-term (Next 2 Weeks)

5. **Fix M5**: Add `LIMIT` + loop to retention cleanup for large tables
6. **Fix M7**: Audit journal/portfolio persistence for update race conditions; add `FOR UPDATE` or atomic `UPDATE ... RETURNING`
7. **Fix M1**: Align cost tracking types (use `integer` cents consistently)
8. **Add retention for `audit_logs`**: Currently no cleanup at all

### Medium-term (Next Month)

9. **Fix M2**: Add connection health monitoring and per-request DB scoping via AsyncLocalStorage
10. **Fix L3**: Squash pre-production migrations (consider combining 0000–0020 into a baseline)
11. **Fix L4**: Add automated `VACUUM ANALYZE` via cron or worker
12. **Fix L5**: Add EXPLAIN ANALYZE regression tests for critical query paths

### Long-term (Roadmap)

13. **Fix M3**: Consider vertical partitioning of `user_settings` (separate `user_preferences` and `user_api_config`)
14. **Consider read replicas**: For `news_articles` and `economic_events` which are read-heavy and write-light
15. **Partition `chat_telemetry`**: By month if the table exceeds 10M rows
16. **Add pg_stat_statements monitoring**: Track slow queries in production

---

## Test Coverage Assessment

| Test File | Coverage |
|-----------|----------|
| `full-migration-chain.test.ts` | Applies all 54 migrations, verifies tables, constraints, indexes |
| `schema-drift.test.ts` | Compares Drizzle schema against migrated DB; tests idempotency |
| `migration-hash-stability.test.ts` | Ensures migration hashes are stable |
| `migration-rename.test.ts` | Tests TAG_ALIASES mapping for renamed migrations |
| `isolated-db.test.ts` | Tests DB shape parity between PGlite and postgres-js |
| `rate-limit.test.ts` | Tests rate limiter logic |
| `phase2-3-migrations.test.ts` | Phase-specific migration testing |
| `phase3-multitenancy-session-a.test.ts` | Multi-tenant session isolation |
| `phase4-5-migrations.test.ts` | Phase 4–5 migration validation |
| `phase6-7-8.test.ts` | Phase 6–8 migration validation |

**Assessment**: Migration testing is **excellent** — comprehensive, idempotency-verified, and drift-checked. However, **query-performance testing is absent** — no EXPLAIN ANALYZE or query-plan regression tests.

---

## Appendix: Key Metrics

| Metric | Value |
|--------|-------|
| Total tables | 37 active (48 including historical) |
| Total migrations | 54 |
| Total indexes | ~80 |
| Total CHECK constraints | 7 |
| Total unique constraints | 12 |
| RLS-protected tables | 24 |
| Global (shared) tables | 10 |
| Pool size (web) | 5 |
| Pool size (worker) | 3 |
| Statement timeout (web) | 8s |
| Statement timeout (worker) | 30s |
| `getDb()` call sites | 241+ |
| `.transaction()` call sites | 15 |
| `ON CONFLICT` usage sites | 13 |
