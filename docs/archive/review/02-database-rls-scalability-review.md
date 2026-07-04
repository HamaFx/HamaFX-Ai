# 02 — Database, RLS & Scalability Review (HamaFX-Ai)

> **Read-only audit.** Nothing in the repo was modified, run, migrated, seeded, or
> executed to produce this document. Every claim below is grounded in a file/line
> reference from the checked-out tree; anything not verifiable from the code is
> explicitly flagged as an **Open Question** rather than asserted.
>
> **This file is written as an implementation-ready handoff prompt for the next
> agent.** Sections 4–6 are meant to be actioned directly.

---

## 1. Context

**Today (single-tenant, single-user app):**

- **DB:** Supabase Postgres, **Free tier**, with `pgvector` + `pgcrypto` extensions
  (`packages/db/src/schema/_extensions.ts`, installed via
  `scripts/install-extensions.mjs` and migration `0000`).
- **ORM:** Drizzle (`drizzle-orm/postgres-js`), schema in
  `packages/db/src/schema/*.ts`, migrations in `packages/db/drizzle/*.sql`
  (`0000`–`0034`, journalled in `drizzle/meta/_journal.json`).
- **Auth:** NextAuth v5 tables (`schema/auth.ts`). `users.role` is **flat** —
  the comment states *"all users are 'user'. No admin/user distinction."*
- **Tenancy model:** rows are scoped to a user by a `user_id` **column** on
  ~24 tables, filtered in application code with `eq(table.userId, …)` or the
  optional `withUserScope()` helper (`packages/db/src/with-user-scope.ts`).
  **There is no `tenant_id`/`org_id` anywhere and no Row Level Security.**
- **Runtimes hitting the same DB:**
  - **Vercel serverless** (web app) — pool `max = 5` per instance.
  - **Always-on GCE worker** (`hamafx-cron` VM) — pool `max = 3`, sets
    `HAMAFX_RUNTIME=worker`. Flushes `live_ticks` ~1 Hz and writes `candles_1m`
    on bar close, plus cron jobs.
  - Both connect through the Supabase **transaction pooler** (`prepare: false`,
    `client.ts`).
- **Backups:** nightly `pg_dump` + nightly journal JSON export to GCS, weekly
  verified restore rehearsal (`infra/cron-vm/scripts/*.sh`,
  `infra/cron-vm/RECOVERY.md`).

**Target:**

- **Multi-tenant hosted SaaS** — many customers share one database; strict
  cross-tenant isolation required.
- **Open-core self-hostable edition** — stays **single-tenant per install**
  (one deployment = one customer), so tenancy hardening must be *opt-in* /
  no-op when self-hosted, not a hard dependency.

> **Scope note:** The task named `docs/06-data-sources.md`. That file does **not
> exist**; the data documentation lives in `docs/04-data-layer.md`
> (`docs/06-*` is `06-frontend.md`). Flagged, not fabricated.

---

## 2. Findings

Severity: **Critical** (ship-blocker for multi-tenant) · **High** · **Medium** · **Low/Info**.

| # | Sev | Location | Problem | Impact |
|---|-----|----------|---------|--------|
| **F1** | **Critical** | all `drizzle/*.sql`; `with-user-scope.ts` | **No Row Level Security exists.** Zero `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` in any migration (the only RLS token is a defensive `DISABLE ROW LEVEL SECURITY` on the *dropped* legacy `onchain_signals` table in `0009_news_articles.sql:79`). Isolation is 100% application-side via `eq(userId)`. `with-user-scope.ts` itself documents that *"the codebase currently uses `eq()` directly in most persistence files… existing code may be migrated incrementally."* | In multi-tenant, **one missing `.where(userId=…)` in any of dozens of query sites = silent cross-tenant data leak.** No DB-enforced backstop. The pooler connects as a single Postgres role, so nothing at the DB layer prevents a query from reading another tenant's rows. |
| **F2** | **High** | `schema/auth.ts` (`users`) | **No tenant/org entity.** `users.role` is flat; there is no `organizations`/`teams` table, no membership join table, no `tenant_id`. | If a "tenant" is a single user, `user_id` suffices. If a tenant is a **team/org** (the usual SaaS shape — shared workspaces, org-level billing, seats), the data model cannot express it at all. Must be decided **before** RLS design, because the RLS predicate key (`user_id` vs `tenant_id`) depends on it. |
| **F3** | **High** | `schema/chat.ts` (`chat_messages`); `schema/decision-signals.ts` (`decision_signal_outcomes`) | **Child tables have no direct tenant column** — scoped only through a parent FK. `chat_messages` has `thread_id` only (owner lives on `chat_threads.user_id`). `decision_signal_outcomes` has `signal_id` only (owner on `decision_signals.user_id`). | RLS on these needs an `EXISTS (SELECT 1 FROM parent …)` sub-select policy (slower, easy to get wrong), **or** the `user_id` must be denormalized down. Any app query that loads `chat_messages` purely by `thread_id` without first proving thread ownership is a leak vector. |
| **F4** | **High** | `schema/memory.ts` (`memory_embeddings_hnsw_idx`); `packages/ai/src/memory/memory-index.ts` (`searchMemory`) | **pgvector HNSW index is not tenant-filter-aware.** The index is a plain `hnsw (embedding vector_cosine_ops)`. `searchMemory` runs `… WHERE user_id = $1 AND kind IN (…) ORDER BY embedding <=> $vec LIMIT k`. pgvector applies `user_id` as a **post-filter** over the graph walk. | Single-tenant today = fine. Multi-tenant: as each tenant owns a shrinking fraction of `memory_embeddings`, HNSW returns its `ef_search` (default 40) **global** nearest neighbours, then discards rows that aren't this tenant's → **recall collapses / empty results** unless iterative scan is enabled or `ef_search` is raised. (`news_embeddings` is a **shared global corpus** — correctly *not* user-scoped — so it is unaffected.) |
| **F5** | **Medium** | `drizzle/0000_lazy_red_shift.sql:120`, `drizzle/0004_journal_system.sql:28`; all AI query code | **pgvector params untuned + no runtime `ef_search`.** Both HNSW indexes use defaults (`m=16`, `ef_construction=64`). No `SET LOCAL hnsw.ef_search` anywhere; iterative scan not enabled (grep for `ef_search`/`SET LOCAL`/`probes` → none in query paths). | Acceptable at hundreds–low-thousands of rows. Will under-recall / mis-latency as the memory corpus and tenant count grow. Compounds F4. |
| **F6** | **High** | `infra/cron-vm/RECOVERY.md` (pre-flight); `scripts/backup-db.sh`; `scripts/backup-journal.sh` | **Backups run against the transaction pooler.** RECOVERY.md pre-flight sets `DATABASE_URL="postgres://…pooler.supabase.com:6543/…?pgbouncer=true&prepare=false"`, and both backup scripts dump/read via `$DATABASE_URL`. | `pg_dump` needs a stable session + a consistent MVCC snapshot; the **transaction-mode** pooler (6543) multiplexes statements across backends and does not guarantee session continuity → dumps can fail or be **inconsistent**. Supabase guidance is to `pg_dump` over a **direct / session-mode (5432)** connection. Same risk for the `pg_restore --clean` against `$DATABASE_URL` in RECOVERY Scenario 1 step 5. |
| **F7** | **Medium** | `infra/cron-vm/scripts/verify-restore.sh` | **Weekly restore rehearsal does not validate the vector schema.** It boots `postgres:15-alpine` (no `pgvector`), logs that extension creation *"may not be available… non-fatal"* and that `pg_restore` *"reported errors… we still assert row counts,"* then asserts only `COUNT(*)` on `journal_entries` + `chat_threads`. | The rehearsal proves **row data** restores, **not** that HNSW indexes / `vector` columns restore. A future change to vector objects could silently break real recovery while the weekly health check stays green — a false sense of safety. |
| **F8** | **Medium** | `scripts/backup-db.sh`; `scripts/backup-journal.sh` | **Backups are not tenant-aware.** `pg_dump` is whole-DB; the journal export is `json_agg(j) FROM journal_entries j` with **no `user_id` filter**. No per-tenant export or delete tooling exists. | Future **GDPR** Art. 15 (export) / Art. 17 (erasure) requests have no supported path. FK `ON DELETE CASCADE` from `users` gives *deletion*, but there is no verified **per-tenant export** and no rehearsal that a tenant delete is complete. Relevant once real customers exist. |
| **F9** | **Medium** | `schema/candles-1m.ts` | **Redundant index.** PK is `primaryKey({ columns: [symbol, t] })`; an *additional* `candles_1m_symbol_t_idx` btree is declared on the **same** `(symbol, t)`. | Pure waste: a duplicate index doubles write amplification on the hot ~1 Hz candle-close writer and wastes storage against the 500 MB Free budget. Drop it. (`candles_1m` is global market data — correctly un-scoped.) |
| **F10** | **Medium** | `packages/db/drizzle.config.ts`; `.env.example` | **Migrations run over the pooler too; no direct/session URL.** `drizzle.config.ts` reads the same `DATABASE_URL`/`POSTGRES_URL`; `.env.example` exposes only those two (no `DIRECT_URL`). DDL, advisory locks, and drizzle-kit's migration bookkeeping over a **transaction** pooler are unreliable. | Migration application can hang or misbehave; advisory-lock-based migration guards don't work through transaction pooling. |
| **F11** | **Low/Info** | `packages/db/src/client.ts` | **TLS `rejectUnauthorized: false`.** Cert verification disabled (self-documented, with a `SUPABASE_CA_CERT` remediation path). | Not a tenancy bug, but a hosted-SaaS hardening item: traffic is encrypted but not authenticated against a pinned CA. |
| **F12** | **Low** | `schema/journal.ts` and others | **Listing composite indexes could be tighter.** `journal_entries` indexes `user_id`, `symbol`, `opened_at` as three single-column indexes; the common "my trades, newest first" access pattern (`WHERE user_id=$1 ORDER BY opened_at DESC`) is not covered by a composite `(user_id, opened_at)`. Low-volume tables (`daily_ai_spend`, `provider_tests`, `briefings_emitted`) have PK-only indexing. | Minor query-plan inefficiency; only matters as per-tenant row counts grow. |

### 2a. What is already GOOD (recorded so it is not re-flagged)

- **Migration hygiene is solid (answers Investigate #6).** `_journal.json` is linear
  `0000`→`0034`; the one legacy removal (`onchain_signals`) is guarded
  (`DO $$ … EXCEPTION WHEN undefined_table … END $$;` + `DROP TABLE IF EXISTS … CASCADE`),
  so it replays cleanly from scratch. Tests enforce this:
  `test/full-migration-chain.test.ts`, `test/schema-drift.test.ts`,
  and per-migration tests. **No evidence of undocumented manual drift.**
- **Pooling config itself is reasonable** (`client.ts`): `postgres-js` with
  `prepare:false` (correct for the transaction pooler), per-runtime pool sizes
  (5 web / 3 worker), `statement_timeout` (8 s web / 30 s worker),
  `idle_timeout`, `max_lifetime`, lazy singleton reused across warm invocations.
  The problems are (a) using the *same pooled* URL for DDL/backup (F6, F10) and
  (b) aggregate-connection math under many instances (see §4.3).
- **Hot-path indexes largely present (answers Investigate #2):**
  - Chat history load: `chat_messages_thread_idx (thread_id, created_at)` ✔; thread
    list `chat_threads_user_id_idx` + `chat_threads_updated_at_idx` ✔.
  - Live tick reads: `live_ticks` PK on `symbol` (point lookup) ✔.
  - `candles_1m` PK `(symbol, t)` ✔ (plus the redundant dup — F9).
  - News hybrid search: `news_embeddings_hnsw_idx` ✔, `news_fts_idx` (GIN tsvector) ✔,
    `news_symbols_gin` ✔.
  - Journal: `user_id` / `symbol` / `opened_at` indexes ✔ (tighten per F12).
- **`live_ticks` / `candles_1m` writer design is appropriate:** `live_ticks` is a
  3-row snapshot UPSERT keyed by `symbol`; `candles_1m` is PK-deduped by `(symbol,t)`
  and pruned to 14 days. Both are **global reference data**, correctly un-scoped.

---

## 3. Root cause (Critical / High only)

- **F1 (no RLS):** The app was born single-user. `user_id` columns and
  `withUserScope()` were added later ("Phase A — multi-user") as an *application*
  convention, but the DB was never switched to enforce isolation. The optionality
  is explicit in `with-user-scope.ts` ("existing code may be migrated
  incrementally"), so isolation correctness depends on every developer
  remembering a `WHERE` clause forever — unsafe once untrusted tenants share the DB.
- **F2 (no tenant entity):** Same origin — a single-user product has no reason
  to model orgs. The multi-tenant target reintroduces the question the schema
  never had to answer: *is the isolation boundary a user or an organization?*
- **F3 (child tables un-scoped):** Normalization. When there is one user, putting
  `user_id` only on the aggregate root (`chat_threads`, `decision_signals`) and
  reaching children via FK is clean. Multi-tenant + RLS inverts that trade-off:
  the isolation key now wants to be on **every** table the policy guards.
- **F4/F5 (pgvector not filter-aware):** HNSW was tuned for a *global* corpus
  (news), where no per-row filter is needed, then reused for `memory_embeddings`
  which **is** per-user. The index shape didn't follow the column that became the
  tenant key.
- **F6 (backup over pooler):** RECOVERY.md standardized on one convenient
  `DATABASE_URL` (the pooler, which is what Vercel/worker use) and reused it for
  `pg_dump`/`pg_restore`, without separating the **admin/session** connection that
  logical dumps require.

---

## 4. Recommended fix (concrete)

### 4.1 Decide the tenancy key, then add the column (F1, F2, F3)

**Step 0 (blocking decision — see §7):** Is a tenant a **user** or an **organization**?
The rest assumes an **`org`/`tenant`** boundary (safe superset — a solo user is an
org of one). If you commit to *user = tenant*, substitute `user_id` for
`tenant_id` everywhere below and skip the `organizations` table.

**New tables (additive):**

```sql
-- organizations: the tenant root
CREATE TABLE organization (
  id            text PRIMARY KEY,              -- app-generated id (matches users.id style)
  name          text NOT NULL,
  plan          text NOT NULL DEFAULT 'free',  -- billing tier
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz                    -- soft delete, mirrors users.deletedAt
);

-- membership: which users belong to which org, and their role
CREATE TABLE organization_member (
  org_id   text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id  text NOT NULL REFERENCES "user"(id)       ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'member',           -- 'owner' | 'admin' | 'member'
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX organization_member_user_idx ON organization_member(user_id);
```

**Add `tenant_id` (nullable first) to every tenant-owned table.** Drizzle column:

```ts
tenantId: text('tenant_id').references(() => organization.id, { onDelete: 'cascade' }),
```

Apply to the ~24 user-scoped tables (`chat_threads`, `alerts`, `journal_entries`,
`memory_embeddings`, `decision_signals`, `portfolio_positions`, `portfolio_settings`,
`agent_opinions`, `chat_telemetry`, `chat_tool_telemetry`, `push_subscriptions`,
`shared_snapshots`, `notification_noise_state`, `bot_links`, `provider_tests`,
`briefings_emitted`, `daily_ai_spend`, `user_sessions`, `rate_limits`, `audit_logs`,
`user_settings`, `user_symbols`, `decision_signal_feedback`) **and** the two
FK-only children (**F3**): `chat_messages`, `decision_signal_outcomes` (denormalize
`tenant_id` down so RLS is a simple equality, not an `EXISTS` sub-select).

Backfill from existing ownership, then flip to `NOT NULL` in a later migration
(sequencing in §5).

### 4.2 Row Level Security (F1) — the policy shape

Enable **and FORCE** RLS on every tenant table (FORCE so even the table owner is
subject to policy — per Drizzle/Postgres RLS guidance), and gate on a per-connection
GUC that your query layer sets:

```sql
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON journal_entries
  USING      (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
```

- `current_setting('app.current_tenant', true)` — the `true` makes it return NULL
  (not error) when unset, so **self-hosted single-tenant installs that never set it
  simply match nothing extra** — keep RLS *disabled* on self-host, or run all
  queries as a `BYPASSRLS` role there (open-core toggle).
- **Set the GUC per transaction** in the Drizzle layer:
  `SET LOCAL app.current_tenant = $tenantId;` wrapped around each request's queries
  (Drizzle's `createDrizzle`/transaction RLS wrapper pattern documented at
  orm.drizzle.team/docs/rls, or Supabase's `request.jwt.claims` + `auth.uid()` when
  using Supabase Auth roles).
- Use a dedicated **`BYPASSRLS` admin role** (separate credentials) for the worker's
  legitimate cross-tenant jobs (backfills, cron) and for migrations — never for the
  web request path.
- The **shared/global** tables (`news_articles`, `news_embeddings`, `candles_1m`,
  `live_ticks`, `cot_reports`, `economic_events`, `intermarket_resonance`,
  `snapshots`, `symbol_catalog`, `provider_throttle`, `cron_runs`) stay **without**
  RLS (read-mostly reference data) — but confirm the app never writes tenant data
  into them.

### 4.3 Connection / pooling changes (F6, F10, and mixed-workload safety)

- **Add a second connection string.** Introduce `DIRECT_URL` (Supabase **session
  mode / direct**, port `5432`) alongside the pooled `DATABASE_URL` (transaction
  mode, `6543`). Route:
  - **App runtime (Vercel + worker request/tick queries)** → pooled `6543`
    (`prepare:false`) — unchanged.
  - **`drizzle.config.ts` migrations** → `DIRECT_URL` (session `5432`).
  - **`backup-db.sh` / `backup-journal.sh` / `verify-restore.sh` production
    restore** → `DIRECT_URL` (session `5432`). This is the fix for F6.
- **Aggregate connection math.** Web pool `max=5` × N Vercel instances can burst
  high; keep the **app-side total under ~40% of the DB's backend connection ceiling**
  (Supavisor guidance) so Auth/worker/cron aren't starved. On Free-tier compute the
  direct backend ceiling is small (low tens), which is *why* the pooler is
  mandatory — but verify the exact number for your compute size (§7). Consider
  lowering web `max` to 3 and relying on the pooler to fan out.
- Keep `prepare:false` for the transaction pooler (already correct).

### 4.4 pgvector (F4, F5)

- **Make the memory index filter-aware.** Two viable shapes:
  1. **Partial/partitioned HNSW is impractical per-tenant** (too many tenants); instead
     **raise recall under filtering**: enable pgvector **iterative index scans**
     (`SET LOCAL hnsw.iterative_scan = 'relaxed_order';` + tune `hnsw.max_scan_tuples`)
     around `searchMemory`, and/or **raise `ef_search`** per query
     (`SET LOCAL hnsw.ef_search = 100;`) when a tenant filter is present.
  2. If tenants are few and large, consider **table partitioning of
     `memory_embeddings` by tenant** with a per-partition HNSW index.
- **Tune build params** as the corpus grows: rebuild HNSW with `m = 24–32`,
  `ef_construction = 128` (higher recall, accept larger build/size). Plan a
  **reindex when >30% new rows** accumulate.
- Add `tenant_id` to the memory query `WHERE` (replacing/adding to `user_id`) once
  §4.1 lands, and keep the vector `ORDER BY` last.

### 4.5 Backups (F7, F8)

- **F7:** In `verify-restore.sh`, use a Postgres image **with pgvector**
  (e.g. `pgvector/pgvector:pg15`) so `CREATE EXTENSION vector` succeeds and the
  HNSW indexes actually restore; then **fail the rehearsal** (non-zero exit + HC
  fail ping) if `pg_restore` reports errors, instead of treating them as expected.
  Add an assertion that the vector indexes exist post-restore
  (`SELECT count(*) FROM pg_indexes WHERE indexdef ILIKE '%hnsw%'`).
- **F8:** Add a **per-tenant export** script (`SELECT … WHERE tenant_id = $1` →
  JSON/NDJSON per table, or `pg_dump --table … ` filtered) and a **per-tenant
  delete** script (rely on `ON DELETE CASCADE` from `organization`, then verify zero
  residual rows across all tenant tables). Rehearse both in the weekly job.

### 4.6 Index cleanup (F9, F12)

- **Drop** `candles_1m_symbol_t_idx` (duplicate of the PK).
- **Add** `journal_entries (user_id/tenant_id, opened_at DESC)` composite for the
  listing path; review similar per-tenant "newest first" queries.

---

## 5. Step-by-step implementation plan (ordered, additive-first)

Do these **in order**. Steps 1–4 are backward-compatible and safe to ship while the
app still runs single-tenant; RLS enforcement (step 7) is the cutover.

1. **Resolve the §7 blocking decisions** (tenant = user vs org; retention; budget).
   Do not write migrations until the tenancy key is chosen.
2. **Migration A (additive, nullable):** create `organization` +
   `organization_member`; add **nullable** `tenant_id` to every tenant-owned table
   (incl. `chat_messages`, `decision_signal_outcomes`). No behavior change yet.
3. **Backfill migration/script:** create one `organization` per existing user (or the
   single self-host org), populate `organization_member`, and set `tenant_id` on all
   existing rows from current ownership (`user_id`, or parent FK for the two
   children). Run as the `BYPASSRLS`/admin role.
4. **Migration B:** once backfill verified, `ALTER … SET NOT NULL` on `tenant_id`;
   add composite indexes (§4.6) and **drop** `candles_1m_symbol_t_idx`.
5. **Wire the connection layer:** add `DIRECT_URL`; point `drizzle.config.ts` and all
   backup/restore scripts at it (F6/F10). Add the `SET LOCAL app.current_tenant`
   wrapper in the Drizzle request path; create the `BYPASSRLS` admin role for
   worker/cron/migrations.
6. **pgvector prep:** add `SET LOCAL hnsw.ef_search` / iterative-scan settings around
   `searchMemory`; extend the query `WHERE` with `tenant_id`. (Rebuild HNSW with
   higher `m`/`ef_construction` can be deferred until row counts justify it.)
7. **Migration C (cutover):** `ENABLE` + `FORCE ROW LEVEL SECURITY` and
   `CREATE POLICY tenant_isolation` on every tenant table. **Gate this behind an
   env/build flag** so the open-core self-host build skips it (or runs as
   `BYPASSRLS`).
8. **Backups:** update `verify-restore.sh` to a pgvector image and make restore
   errors fatal (F7); add per-tenant export/delete scripts + weekly rehearsal (F8).
9. **Fix TLS** (F11): ship `SUPABASE_CA_CERT` + `rejectUnauthorized: true` for the
   hosted build.

---

## 6. Acceptance criteria

**RLS actually blocks cross-tenant reads:**
- With `app.current_tenant` set to tenant A, `SELECT * FROM journal_entries` returns
  **only** A's rows; setting it to B returns only B's; **unset returns zero** tenant
  rows (not all rows).
- Deliberate omission test: a query with **no** `WHERE tenant_id` under a
  non-`BYPASSRLS` role still returns only the current tenant's rows (proves the DB,
  not the app, is enforcing).
- `INSERT`/`UPDATE` with a mismatched `tenant_id` is rejected by `WITH CHECK`.
- The `BYPASSRLS` admin role can still see all tenants (for worker/cron), and the web
  role **cannot** assume it.

**Indexes are used (EXPLAIN ANALYZE expectations):**
- Chat history: `EXPLAIN ANALYZE` of the message-load query shows an
  **Index Scan** on `chat_messages_thread_idx`, not a Seq Scan.
- Journal listing: shows Index Scan on the new `(tenant_id, opened_at)` composite.
- Memory search: `EXPLAIN ANALYZE` of `searchMemory` shows an **Index Scan using
  `memory_embeddings_hnsw_idx`** with the `tenant_id` filter applied, and returns the
  full `LIMIT k` rows for a small tenant (recall check — not fewer than expected).
- `candles_1m` writes: confirm only the PK index remains (dup dropped).

**Backups still restore cleanly after schema changes:**
- `verify-restore.sh` (pgvector image) exits **0**, `pg_restore` reports **no**
  errors, HNSW indexes exist post-restore, and row-count assertions pass — for a dump
  taken **after** the RLS/`tenant_id` migrations.
- Per-tenant export produces a file whose row counts match
  `SELECT count(*) … WHERE tenant_id = $1` for each table.
- Per-tenant delete leaves **zero** residual rows for that tenant across all tenant
  tables.

---

## 7. Open questions for the human owner

1. **Tenant boundary:** is a tenant an individual **user** or an **organization/team**
   (shared workspaces, org-level billing, multiple seats)? This picks `user_id` vs
   `tenant_id` and whether §4.1's `organization` tables are needed. *(Blocks all
   migration work.)*
2. **Open-core toggle:** confirm the self-host edition should run with **RLS
   disabled** (or a `BYPASSRLS` role) so a single-tenant install has zero policy
   overhead — vs. always-on RLS with an auto-set single tenant. Which?
3. **Data retention / GDPR:** what is the retention policy per tenant, and is verified
   **per-tenant export + hard delete** a launch requirement or fast-follow? (Drives
   F8 priority.)
4. **Budget / Supabase tier:** Free tier is **500 MB DB, 5 GB egress, 1 GB storage,
   ~200 peak Realtime connections** (Supabase pricing, 2026). Multi-tenant will blow
   the 500 MB and 5 GB egress caps first. Is there budget to move to **Pro ($25/mo:
   8 GB disk, 250 GB egress, 7-day daily backups)** before onboarding paying tenants?
   *(Verify the exact **direct-connection ceiling** for your chosen compute size — it
   governs §4.3 pool math and is not asserted here.)*
5. **Sharding horizon:** do you expect a scale where **DB-per-tenant** or table
   partitioning of `memory_embeddings` (F4 option 2) becomes necessary, or is a
   single RLS-enforced shared DB the long-term plan?
6. **`__system__` rows:** migrations seed a sentinel `__system__` user and default
   several system tables' `user_id` to it (`0009`). Under multi-tenant, should
   system-owned rows map to a reserved system org, or move to the global/un-scoped
   set? Confirm intended treatment.

---

## Appendix A — Full table inventory (40 tables)

`uid` = has a direct `user_id` column · `vec` = has a `vector`/embedding column ·
`scope` = how it would be tenant-scoped.

| Table | uid | vec | idx | Tenant-scope path | Notes |
|-------|-----|-----|-----|-------------------|-------|
| `user` | — | — | PK | **root** | tenancy root; flat `role` |
| `account` | Y(`userId`) | — | PK(provider,accountId) | user_id | NextAuth |
| `session` | Y | — | PK | user_id | NextAuth |
| `verificationToken` | — | — | PK | n/a | auth ephemeral |
| `user_sessions` | Y | — | 1 | user_id | |
| `user_settings` | Y(PK) | (embed model prefs) | PK | user_id | BYOK keys encrypted |
| `user_symbols` | Y | — | PK(user,symbol) | user_id | |
| `chat_threads` | Y | — | 2 | user_id | |
| `chat_messages` | **—** | — | 1 (thread,created) | **via `chat_threads` FK — F3** | |
| `chat_telemetry` | Y | — | 3 | user_id | |
| `chat_tool_telemetry` | Y | — | 4 | user_id | |
| `agent_opinions` | Y | — | 2 | user_id | |
| `alerts` | Y | — | 4 | user_id | |
| `journal_entries` | Y | — | 3 | user_id | tighten composite (F12) |
| `memory_embeddings` | Y | **Y (HNSW)** | 6 | user_id | **F4/F5** filter-aware needed |
| `decision_signals` | Y | — | 3 | user_id | |
| `decision_signal_outcomes` | **—** | — | 3 | **via `decision_signals` FK — F3** | |
| `decision_signal_feedback` | Y | — | 1 | user_id | |
| `portfolio_positions` | Y | — | 2 | user_id | |
| `portfolio_settings` | Y | — | 1 | user_id | |
| `notification_noise_state` | Y | — | 2 | user_id | |
| `bot_links` | Y | — | 1 | user_id | |
| `provider_tests` | Y | — | 0 | user_id | PK-only |
| `briefings_emitted` | Y | — | 0 | user_id | defaults `__system__` |
| `daily_ai_spend` | Y | — | 0 | user_id | PK-only |
| `push_subscriptions` | Y | — | 1 | user_id | |
| `shared_snapshots` | Y | — | 2 | user_id | |
| `rate_limits` | Y | — | 1/PK | user_id | |
| `audit_logs` | Y | — | 2 | user_id | |
| `news_articles` | — | — | 4 (FTS+GIN) | **global** | shared corpus |
| `news_embeddings` | — | **Y (HNSW)** | 1 | **global** | shared — no filter needed |
| `candles_1m` | — | — | PK + **dup (F9)** | **global** | market data |
| `live_ticks` | — | — | PK(symbol) | **global** | 3-row snapshot |
| `cot_reports` | — | — | 1 | **global** | public data |
| `economic_events` | — | — | 3 | **global** | calendar |
| `intermarket_resonance` | — | — | PK(date) | **global** | macro timeseries |
| `snapshots` | — | — | 1 + uniq | **global** | HLOC/pivots |
| `symbol_catalog` | — | — | PK | **global** | reference |
| `provider_throttle` | — | — | 0 | **global** | system |
| `cron_runs` | — | — | 1 | **global** | system |

## Appendix B — Sources (2026)

- **Drizzle ORM — Row-Level Security:** FORCE RLS, `BYPASSRLS` admin role,
  `createDrizzle`/`createDrizzleSupabaseClient` transaction wrapper setting
  `request.jwt.claims` / `auth.uid`, `.link()` for existing tables.
  https://orm.drizzle.team/docs/rls
- **Supabase — Supavisor FAQ:** transaction mode (6543, adds connections on demand,
  best for many short serverless queries) vs session mode (5432, immediate direct
  conns, supports prepared statements); pool size per unique user/db/mode.
  https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI
- **Production Postgres pooling (pgBouncer/Supavisor) tutorial (2026):** transaction
  pool 6543 for app, **session pool 5432 for migrations / prepared statements /
  advisory locks**, keep app-side pool < ~40% of backend connections.
  https://nerdleveltech.com/production-postgres-pooling-pgbouncer-supabase-supavisor-tutorial
- **pgvector index guide, DBA part 2 (updated March 2026):** HNSW default first;
  `ef_search` default 40 (target 40–200); **iterative scans for filtered search**
  (default off) via `hnsw.iterative_scan` + `max_scan_tuples`/`max_probes` +
  `relaxed_order`; build with `m` 24–32 / `ef_construction` 128; reindex at >30% new
  rows; per-query `SET LOCAL ef_search` for multi-tenant.
  https://www.dbi-services.com/blog/pgvector-a-guide-for-dba-part-2-indexes-update-march-2026/
- **Supabase pricing (2026):** Free — 500 MB DB, 5 GB egress, 1 GB storage, 200 peak
  Realtime connections, projects paused after 1 week inactivity. Pro ($25/mo) —
  8 GB disk, 250 GB egress, 100 GB storage, daily backups (7-day retention).
  https://supabase.com/pricing · https://supabase.com/docs/guides/platform/billing-on-supabase

*Uncertain / not verified from code and left as open questions: exact direct-connection
ceiling for the current Supabase compute size; current live DB size / egress vs the
500 MB / 5 GB Free caps (no telemetry in-repo); whether a tenant is a user or an org.*
