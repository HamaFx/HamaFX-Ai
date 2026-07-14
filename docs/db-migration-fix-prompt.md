# DB Migration Reconciliation — Implementation Prompt

> **Mission:** Fix all schema drift, broken triggers, RLS issues, and migration-tracking gaps identified in `docs/db-migration-review.md`. Make production safe for future `drizzle-kit migrate` runs via the predeploy script, without data loss.
>
> **Companion document:** Read `docs/db-migration-review.md` first — it contains the full analysis. This prompt is the execution plan.
>
> **Mode:** Implementation allowed. You MAY modify files in the repo and run DDL against production — but ONLY following the safety gates below.

---

## Critical Safety Constraints

1. **BACK UP FIRST.** Before any DDL, take a Supabase snapshot AND a `pg_dump`. No exceptions.
2. **Test on a branch DB first.** If a staging/preview Supabase project exists, run all DDL there first and verify. If not, at minimum run the reconciliation migration against a local PGlite instance (the repo has `@electric-sql/pglite` + `packages/db/test/` infrastructure).
3. **Never run `drizzle-kit push` against production.** It will drop `tenant_id` from 10 global tables and `symbol_catalog.n_data_symbol`. This is explicitly forbidden.
4. **Never run `drizzle-kit migrate` against production until Phase 0 Steps 1–5 are complete.** The next migrate run will fail at migration 0021 (hash mismatch → re-apply → `ADD COLUMN` fails on existing column) and block the deploy.
5. **All new DDL must be idempotent.** Use `IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... IF NOT EXISTS ... $$` everywhere.
6. **Do NOT remove any production objects unless explicitly confirmed safe.** The review identified objects to keep, not drop.
7. **After each phase, run the verification queries** in §Verification before proceeding to the next phase.

---

## Environment

| Item | Value |
|------|-------|
| Repo root | `/home/ubuntu/HamaFX-Ai` |
| DB package | `packages/db/` |
| Migrations dir | `packages/db/drizzle/` |
| Schema dir | `packages/db/src/schema/` |
| Drizzle config | `packages/db/drizzle.config.ts` |
| Predeploy script | `scripts/predeploy-migrate.mjs` |
| Status script | `packages/db/scripts/migrate-status.mjs` |
| Supabase DB (direct, port 5432) | `postgres://postgres:9kiQNiq0WbAT89hT@db.cxljcbrygnkobqnyxxeg.supabase.co:5432/postgres` |
| Supabase DB (pooler, port 6543) | DO NOT use for DDL — PgBouncer transaction mode silently drops DDL |
| PostgreSQL version | 17.6 |
| psql | Available at `/usr/bin/psql` (v16 client, works with PG17 server) |

**Connection helper for all psql commands:**
```bash
export PGPASSWORD='9kiQNiq0WbAT89hT'
CONN="host=db.cxljcbrygnkobqnyxxeg.supabase.co port=5432 dbname=postgres user=postgres sslmode=require"
```

---

## Phase 0: Unblock Deploys (DO THIS FIRST — before any Vercel prod deploy)

### Step 0.1: Back up production

```bash
export PGPASSWORD='9kiQNiq0WbAT89hT'
pg_dump "host=db.cxljcbrygnkobqnyxxeg.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" \
  --schema=public --no-owner --no-privileges --format=custom \
  --file=/tmp/hamafx-prod-backup-$(date +%Y%m%d-%H%M%S).dump
```
Verify the backup file exists and is non-trivial in size before proceeding. Also take a Supabase dashboard snapshot if available.

### Step 0.2: Pin `migrationsSchema` in `drizzle.config.ts`

**File:** `/home/ubuntu/HamaFX-Ai/packages/db/drizzle.config.ts`

The current config does NOT set `migrationsSchema`. Drizzle-orm defaults to the `drizzle` schema, which is where `drizzle.__drizzle_migrations` already exists with 24 rows. Pin it explicitly.

**Change:** Add `migrationsSchema: 'drizzle',` after the `dialect: 'postgresql',` line. The result should look like:

```typescript
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  migrationsSchema: 'drizzle',
  dbCredentials: {
    url: databaseUrl ?? 'postgres://placeholder@localhost:5432/placeholder',
  },
  strict: true,
  verbose: true,
  extensionsFilters: ['vector'] as unknown as ['postgis'],
});
```

### Step 0.3: Fix the `migrate-status.mjs` script

**File:** `/home/ubuntu/HamaFX-Ai/packages/db/scripts/migrate-status.mjs`

Two bugs:
1. **Line 78:** Queries `"__drizzle_migrations"` without schema qualification → resolves to `public` (empty). Must query `drizzle.__drizzle_migrations`.
2. **Lines 81–82:** Compares `r.hash` (a SHA-256) to `e.tag` (a string like `"0021_user_settings_prefs"`). These never match. Must compute file SHA-256 hashes and compare those.

**Replace the `checkDatabase()` function (approximately lines 71–95) with:**

```javascript
async function checkDatabase() {
  try {
    const { default: postgres } = await import('postgres');
    const { createHash } = await import('node:crypto');
    const sql = postgres(dbUrl, { prepare: false, ssl: { rejectUnauthorized: false } });

    try {
      const rows = await sql`
        SELECT hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id
      `;
      const appliedHashes = new Set(rows.map((r) => r.hash));

      const pending = [];
      for (const entry of journalEntries) {
        const sqlPath = join(DRIZZLE_DIR, `${entry.tag}.sql`);
        const fileContent = readFileSync(sqlPath);
        const fileHash = createHash('sha256').update(fileContent).digest('hex');
        if (!appliedHashes.has(fileHash)) {
          pending.push({ tag: entry.tag, hash: fileHash });
        }
      }

      console.log(`\n   Database has ${appliedHashes.size} applied migrations.\n`);

      if (pending.length > 0) {
        console.log('   Pending migrations:\n');
        for (const { tag, hash } of pending) {
          console.log(`      -> ${tag}  (hash: ${hash.substring(0, 12)}...)`);
        }
        console.log('\n   Run `pnpm migrate:apply` to apply pending migrations.\n');
      } else {
        console.log('   All migrations are applied.\n');
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    console.error('\nCould not query database:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
```

Ensure `join` is imported from `node:path` (check line 24 — it currently imports `{ join, dirname }`, so `join` is available).

### Step 0.4: Insert hash-mismatch records into the tracking table

Three migration files (0007, 0021, 0040) were applied to prod but later edited, causing their SHA-256 hashes to change. Drizzle-kit will try to re-apply them on the next migrate run, which will fail. Insert the **current** file hashes so drizzle-kit skips them.

**First, verify the current file hashes:**
```bash
cd /home/ubuntu/HamaFX-Ai/packages/db/drizzle
sha256sum 0007_idempotency_keys.sql 0021_user_settings_prefs.sql 0040_phase8_billing_nowpayments.sql
```

**Expected hashes (from the review):**
| File | SHA-256 |
|------|---------|
| `0007_idempotency_keys.sql` | `a6a6423b89df48f301690d312c8284c2955fef5f810c55eeb10dff058a718db2` |
| `0021_user_settings_prefs.sql` | `c0dbe515f5b31824b94b0a1b99e0d4fbac7856be071fd19e843bc120f2ce2814` |
| `0040_phase8_billing_nowpayments.sql` | `6867fed776b187e985e5cae99e6f5f7a862cd8b2ab231e1d3ba6d42dea93a24d` |

If any hash differs from the table above, use the NEW hash from `sha256sum` output instead.

**Then run this SQL against production (direct connection, port 5432):**
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('a6a6423b89df48f301690d312c8284c2955fef5f810c55eeb10dff058a718db2', extract(epoch from now())::bigint * 1000),
  ('c0dbe515f5b31824b94b0a1b99e0d4fbac7856be071fd19e843bc120f2ce2814', extract(epoch from now())::bigint * 1000),
  ('6867fed776b187e985e5cae99e6f5f7a862cd8b2ab231e1d3ba6d42dea93a24d', extract(epoch from now())::bigint * 1000);
```

**Verify:**
```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;  -- Should now be 27
```

### Step 0.5: Fix the 3 broken things in prod (trigger function, user trigger, account/session RLS)

These are the DDL changes that migrations 0039 and 0041 tried to apply but failed (Supabase pooler dropped them). Apply them directly via psql against the direct connection (port 5432).

**Run this SQL block against production:**

```sql
-- Fix 1: Replace broken update_updated_at() with column-name-agnostic version
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $
DECLARE
  col_name text;
BEGIN
  SELECT column_name INTO col_name
  FROM information_schema.columns
  WHERE table_schema = TG_TABLE_SCHEMA
    AND table_name = TG_TABLE_NAME
    AND column_name IN ('updated_at', 'updatedAt')
  LIMIT 1;
  IF col_name = 'updated_at' THEN
    NEW.updated_at = now();
  ELSIF col_name = 'updatedAt' THEN
    NEW."updatedAt" = now();
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Fix 2: Re-create the trg_updated_at_user trigger (was dropped to unblock onboarding)
DROP TRIGGER IF EXISTS trg_updated_at_user ON "user";
CREATE TRIGGER trg_updated_at_user
  BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Fix 3: Disable RLS on account and session (FORCE RLS + zero policies = blocked)
DROP POLICY IF EXISTS tenant_isolation ON account;
ALTER TABLE account NO FORCE ROW LEVEL SECURITY;
ALTER TABLE account DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON session;
ALTER TABLE session NO FORCE ROW LEVEL SECURITY;
ALTER TABLE session DISABLE ROW LEVEL SECURITY;
```

**Verification queries (run each — all must pass before proceeding):**

```sql
-- Verify Fix 1: function should have information_schema.columns lookup
SELECT prosrc FROM pg_proc WHERE proname = 'update_updated_at' AND pronamespace = 'public'::regnamespace;

-- Verify Fix 2: user table should have both triggers
SELECT tgname FROM pg_trigger WHERE tgrelid = '"user"'::regclass AND NOT tgisinternal;
-- Expected: trg_updated_at_user, hamafx_user_personal_organization_after_insert

-- Verify Fix 3: account/session RLS disabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND relname IN ('account', 'session');
-- Expected: both show f, f

SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('account', 'session');
-- Expected: 0 rows
```

**Critical functional test — verify user UPDATE works (the original break was here):**
```sql
BEGIN;
UPDATE "user" SET "updatedAt" = now() WHERE id = '__system__';
ROLLBACK;
-- If this succeeds without error, the trigger fix works
```

### Step 0.6: Mark the 17 pending migrations as applied in the tracking table

Migrations 0023–0039 and 0041 were never recorded as applied. However, **most of their DDL effects are already present in prod** (confirmed by the review). The 3 things actually missing were fixed in Step 0.5. Since re-running the originals would fail (non-idempotent DDL), mark them as applied by inserting their current file hashes.

**First, verify the current file hashes:**
```bash
cd /home/ubuntu/HamaFX-Ai/packages/db/drizzle
for f in 0023_burly_nightcrawler.sql 0024_living_doorman.sql 0025_multi_agent_orchestration.sql 0026_decision_signal_tracking.sql 0027_phase1_critical_fixes.sql 0028_phase2_data_integrity.sql 0029_phase3_schema_fixes.sql 0030_phase4_security.sql 0031_phase7_comments_and_triggers.sql 0032_phase8_soft_delete_enums_fts.sql 0033_fix_analysis_mode.sql 0034_breezy_absorbing_man.sql 0035_phase3_multitenancy_foundation.sql 0036_phase3_tenant_constraints.sql 0037_phase3_bypassrls_admin_role.sql 0038_phase3_rls_cutover.sql 0039_phase3_runtime_fixes.sql 0041_fix_missing_tenant_columns.sql; do
  echo "$f $(sha256sum "$f" | cut -d' ' -f1)"
done
```

**Expected hashes (verify each matches):**

| File | SHA-256 |
|------|---------|
| `0023` | `a4b42fe3297ede68b0a45a819a37d6e4da7165a708de9d2baa1a0332416a6aec` |
| `0024` | `9a22c40e269de577753b94e184267422615f2fbe3b33ae00528295e1e09c26b7` |
| `0025` | `8aceba74b69b4148d9f36f9914101e7e5b6113427d571c6f9bfd40e29ad7c020` |
| `0026` | `b7d42fb644395f8e461a96d2d7b0336756119d576417d54b2045d6df9f124680` |
| `0027` | `6f0c603b47d8bdb392c80105ea6b41c49b75b821a093ea913473cb6cfb26ae61` |
| `0028` | `d60d534637a1fc0f197450196c53011b6270f3a833ddb2e0638f45123e897103` |
| `0029` | `a03a9a8b5e5daccc699ba639ecfa5d20729796b6323e7e4b7f9b91d61bffa06f` |
| `0030` | `c295817d88f77ea8d4118cbdd24d55c8e1f572f3ae1391318a3203c4892a0302` |
| `0031` | `1683118438aeb7cebb9ff66989b6b38930a69e047b24c4559355e0b07b93e746` |
| `0032` | `047a109169ccf72126c98c25df28eba2ad5e6a829f0943d6b99c59dd12a89ce1` |
| `0033` | `556a99b9d3c21f854b9d86146a6bacf2ac6716e8b6fb321563cc083d01f70b92` |
| `0034` | `3514d99aa835b8a856db981f30bfffd95a90e2f3c7064fbccb20b4e7815bbb81` |
| `0035` | `be53d591bf600e9b62fb74e415dadf1011c3ddd5477fb85ca6b54a3060f35faa` |
| `0036` | `20565ff8bef7115f80b4cfb19426215abfc631ddb68c0e648648f22e70f1dc1b` |
| `0037` | `c494b7fec5c62745c1baa41883e8ab6cbea9dafa69ec3b86b16109a2ed79d839` |
| `0038` | `6efa2b5e12ff0cd8b258e721eec2ff99c6f931db204c9bab9624544c395bd7ee` |
| `0039` | `88577c3ec86be02ab6b928bee151ad73961e0bbc9bc965648a7587cd4df37325` |
| `0041` | `f3c3c53111ee59b950359f04be5a03d0addc798d139fdda21ac652b17d69f1f7` |

**⚠️ Before inserting, verify key DDL is actually present in prod:**
```sql
-- tenant_id NOT NULL (from 0035/0036)
SELECT table_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND column_name='tenant_id' AND table_name IN ('alerts','chat_threads','journal_entries','user_settings');
-- Expected: all NO

-- RLS policies (from 0038)
SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation';
-- Expected: 25

-- Billing tables (from 0040)
SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('plans','subscriptions','payments','ipn_events');
-- Expected: 4

-- Enums (from 0032)
SELECT count(*) FROM pg_type t JOIN pg_namespace n ON t.typnamespace=n.oid WHERE n.nspname='public' AND t.typtype='e';
-- Expected: 20

-- hamafx_admin role (from 0037)
SELECT count(*) FROM pg_roles WHERE rolname='hamafx_admin';
-- Expected: 1
```

If any verification fails, DO NOT mark that migration as applied — investigate and fix the missing DDL first.

**Insert all 18 hashes (0023–0039 + 0041):**
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('a4b42fe3297ede68b0a45a819a37d6e4da7165a708de9d2baa1a0332416a6aec', extract(epoch from now())::bigint * 1000),
  ('9a22c40e269de577753b94e184267422615f2fbe3b33ae00528295e1e09c26b7', extract(epoch from now())::bigint * 1000),
  ('8aceba74b69b4148d9f36f9914101e7e5b6113427d571c6f9bfd40e29ad7c020', extract(epoch from now())::bigint * 1000),
  ('b7d42fb644395f8e461a96d2d7b0336756119d576417d54b2045d6df9f124680', extract(epoch from now())::bigint * 1000),
  ('6f0c603b47d8bdb392c80105ea6b41c49b75b821a093ea913473cb6cfb26ae61', extract(epoch from now())::bigint * 1000),
  ('d60d534637a1fc0f197450196c53011b6270f3a833ddb2e0638f45123e897103', extract(epoch from now())::bigint * 1000),
  ('a03a9a8b5e5daccc699ba639ecfa5d20729796b6323e7e4b7f9b91d61bffa06f', extract(epoch from now())::bigint * 1000),
  ('c295817d88f77ea8d4118cbdd24d55c8e1f572f3ae1391318a3203c4892a0302', extract(epoch from now())::bigint * 1000),
  ('1683118438aeb7cebb9ff66989b6b38930a69e047b24c4559355e0b07b93e746', extract(epoch from now())::bigint * 1000),
  ('047a109169ccf72126c98c25df28eba2ad5e6a829f0943d6b99c59dd12a89ce1', extract(epoch from now())::bigint * 1000),
  ('556a99b9d3c21f854b9d86146a6bacf2ac6716e8b6fb321563cc083d01f70b92', extract(epoch from now())::bigint * 1000),
  ('3514d99aa835b8a856db981f30bfffd95a90e2f3c7064fbccb20b4e7815bbb81', extract(epoch from now())::bigint * 1000),
  ('be53d591bf600e9b62fb74e415dadf1011c3ddd5477fb85ca6b54a3060f35faa', extract(epoch from now())::bigint * 1000),
  ('20565ff8bef7115f80b4cfb19426215abfc631ddb68c0e648648f22e70f1dc1b', extract(epoch from now())::bigint * 1000),
  ('c494b7fec5c62745c1baa41883e8ab6cbea9dafa69ec3b86b16109a2ed79d839', extract(epoch from now())::bigint * 1000),
  ('6efa2b5e12ff0cd8b258e721eec2ff99c6f931db204c9bab9624544c395bd7ee', extract(epoch from now())::bigint * 1000),
  ('88577c3ec86be02ab6b928bee151ad73961e0bbc9bc965648a7587cd4df37325', extract(epoch from now())::bigint * 1000),
  ('f3c3c53111ee59b950359f04be5a03d0addc798d139fdda21ac652b17d69f1f7', extract(epoch from now())::bigint * 1000);
```

**Verify:**
```sql
SELECT count(*) FROM drizzle.__drizzle_migrations;  -- Should be 45 (24 + 3 + 18)
```

### Step 0.7: Verify the predeploy is now unblocked

Run the fixed `migrate-status.mjs` script:
```bash
cd /home/ubuntu/HamaFX-Ai
DATABASE_URL='postgres://postgres:9kiQNiq0WbAT89hT@db.cxljcbrygnkobqnyxxeg.supabase.co:5432/postgres' \
  pnpm --filter @hamafx/db migrate:status
```
**Expected:** `All migrations are applied.`

If it still shows pending migrations, the hashes didn't match — re-compute and re-insert.

**✅ Phase 0 complete.** Vercel prod deploys are now unblocked.

---

## Phase 1: Reconcile Schema Drift (code-side changes)

These changes bring the Drizzle schema definitions in sync with prod, so future `drizzle-kit generate` runs produce correct migrations.

### Step 1.1: Add `n_data_symbol` to the Drizzle schema

**File:** `/home/ubuntu/HamaFX-Ai/packages/db/src/schema/symbol-catalog.ts`

Prod has `n_data_symbol` (text, nullable) not in the schema. Add after line 29 (`finnhubSymbol`):

```typescript
  nDataSymbol: text('n_data_symbol'),  // ← ADD THIS LINE
```

### Step 1.2: Align `diagnostic_traces` schema with prod

**File:** `/home/ubuntu/HamaFX-Ai/packages/db/src/schema/diagnostic-traces.ts`

Prod has 3 extra columns (`summary`, `metadata`, `created_at`) and `trace` is nullable (schema says NOT NULL). Also fix index names to match prod.

**Replace the table definition (lines 20–38) with:**

```typescript
export const diagnosticTraces = pgTable(
  'diagnostic_traces',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    threadId: text('thread_id'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMs: integer('duration_ms'),
    stepCount: integer('step_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    status: text('status', { enum: ['completed', 'failed'] }).notNull(),
    summary: text('summary'),
    metadata: jsonb('metadata'),
    trace: jsonb('trace'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('diagnostic_traces_user_id_idx').on(t.userId),
    index('diagnostic_traces_thread_id_idx').on(t.threadId),
    index('diagnostic_traces_started_at_idx').on(t.startedAt),
  ],
);
```

### Step 1.3: Create migration 0042 for `feature_flags` + `diagnostic_traces`

**Create file:** `/home/ubuntu/HamaFX-Ai/packages/db/drizzle/0042_feature_flags_and_diagnostic_traces.sql`

```sql
-- 0042: Migration files for feature_flags and diagnostic_traces
-- These tables were created manually in prod and never had migration files.
-- Idempotent: uses IF NOT EXISTS so safe to run against prod where tables exist.

CREATE TABLE IF NOT EXISTS "feature_flags" (
  "key" text PRIMARY KEY NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "diagnostic_traces" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "thread_id" text,
  "started_at" timestamp with time zone NOT NULL,
  "duration_ms" integer,
  "step_count" integer NOT NULL DEFAULT 0,
  "error_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL,
  "summary" text,
  "metadata" jsonb,
  "trace" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagnostic_traces_user_id_fkey') THEN
    ALTER TABLE "diagnostic_traces" ADD CONSTRAINT "diagnostic_traces_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE;
  END IF;
END $;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "diagnostic_traces_user_id_idx" ON "diagnostic_traces" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_thread_id_idx" ON "diagnostic_traces" ("thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_traces_started_at_idx" ON "diagnostic_traces" ("started_at");
```

**Add to the journal** (`packages/db/drizzle/meta/_journal.json`): add entry with `idx: 42`, `tag: "0042_feature_flags_and_diagnostic_traces"`, `when: <current unix ms>`, `breakpoints: true`.

### Step 1.4: Create migration 0043 for `n_data_symbol`

**Create file:** `/home/ubuntu/HamaFX-Ai/packages/db/drizzle/0043_add_n_data_symbol.sql`
```sql
-- 0043: Add n_data_symbol to symbol_catalog. Exists in prod, no migration. Idempotent.
ALTER TABLE "symbol_catalog" ADD COLUMN IF NOT EXISTS "n_data_symbol" text;
```
**Add to journal:** `idx: 43`, `tag: "0043_add_n_data_symbol"`.

### Step 1.5: Apply migrations 0042 + 0043 to prod (idempotent no-ops)
```bash
cd /home/ubuntu/HamaFX-Ai
DATABASE_URL='postgres://postgres:9kiQNiq0WbAT89hT@db.cxljcbrygnkobqnyxxeg.supabase.co:5432/postgres' \
  pnpm --filter @hamafx/db migrate:apply
```
**Verify:** `SELECT count(*) FROM drizzle.__drizzle_migrations;` → Should be 47.

### Step 1.6: Decide on `tenant_id` for the 10 global tables

10 tables have `tenant_id` (nullable, default `'__system__'`) in prod but NOT in Drizzle schema: `candles_1m`, `cot_reports`, `cron_runs`, `economic_events`, `intermarket_resonance`, `live_ticks`, `news_articles`, `news_embeddings`, `snapshots`, `symbol_catalog`.

**Recommended: Option A — Add `tenantId` to the Drizzle schema** for these tables (prevents push from dropping columns). Add to each schema file:
```typescript
tenantId: text('tenant_id').default(sql`'__system__'`),
```
**Files:** `candles-1m.ts`, `cot.ts`, `cron-runs.ts`, `calendar.ts`, `intermarket-resonance.ts`, `live-ticks.ts`, `news.ts` (2 tables), `snapshots.ts`, `symbol-catalog.ts`. Then run `migrate:gen` to create migration 0044.

**Alternative: Option B — Remove `tenant_id` from prod** (semantically cleaner but riskier). Only if team confirms no code reads these columns.

### Step 1.7: Remove duplicate FTS index

**Create migration:** `/home/ubuntu/HamaFX-Ai/packages/db/drizzle/0045_drop_duplicate_fts_index.sql` (adjust number if 0044 was used for tenant_id)
```sql
-- Drop duplicate FTS index. Schema only defines news_fts_idx.
DROP INDEX IF EXISTS "news_articles_fts_idx";
```
**Add to journal**, **apply to prod**.

---

## Phase 2: Prevention Hardening (CI + tooling)

### Step 2.1: Add idempotency test to CI

**File:** `/home/ubuntu/HamaFX-Ai/packages/db/test/schema-drift.test.ts`

Add a test that applies each migration twice against PGlite to verify idempotency:

```typescript
it('all migrations are idempotent (can be applied twice)', async () => {
  const db = await getPGliteDb(dir);
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> };
  for (const entry of journal.entries) {
    await applyOne(db, entry.tag);  // Apply once
    await applyOne(db, entry.tag);  // Apply again — must not throw
  }
});
```

### Step 2.2: Add a migration-hash-stability CI guard

**Create file:** `/home/ubuntu/HamaFX-Ai/packages/db/test/migration-hash-stability.test.ts`

This test:
1. Reads all migration file SHA-256 hashes
2. Compares against a committed baseline (`packages/db/drizzle/meta/_hashes.json`)
3. Fails if any existing hash changed (new migrations are fine; changed existing ones are flagged)

This prevents developers from editing applied migration files.

### Step 2.3: Add a predeploy safety check

**File:** `/home/ubuntu/HamaFX-Ai/scripts/predeploy-migrate.mjs`

Before `execFileSync('pnpm', ['--filter', '@hamafx/db', 'migrate:apply'], ...)`, add a check that queries `drizzle.__drizzle_migrations` for applied hashes and compares against current file hashes. If a hash mismatch is detected (applied migration file was edited), print a warning with instructions to create a new migration instead.

### Step 2.4: Document the migration workflow in AGENTS.md

**File:** `/home/ubuntu/HamaFX-Ai/AGENTS.md` (around line 60, "Migrations" section)

Add these rules:
- Never run `drizzle-kit push` against prod (it drops prod-only columns)
- Never edit applied migration files (create a new one instead — editing changes the hash)
- Always use `DIRECT_URL` / `POSTGRES_URL_NON_POOLING` (port 5432) for migrations, never the pooler (port 6543)
- All new migrations must be idempotent (`IF NOT EXISTS` / `DO $ ... IF NOT EXISTS ... $`)
- Run `pnpm --filter @hamafx/db migrate:status` before deploying to check for pending migrations

---

## Final Verification Checklist

Run all of these after completing all phases. Every item must pass.

```sql
-- 1. Tracking table count
SELECT count(*) FROM drizzle.__drizzle_migrations;
-- Expected: 47+ (24 original + 3 hash-fix + 18 pending + new migrations)

-- 2. Trigger function is the fixed version
SELECT prosrc FROM pg_proc WHERE proname = 'update_updated_at';
-- Expected: column-name-agnostic with information_schema.columns lookup

-- 3. User trigger exists
SELECT tgname FROM pg_trigger WHERE tgrelid = '"user"'::regclass AND NOT tgisinternal;
-- Expected: trg_updated_at_user, hamafx_user_personal_organization_after_insert

-- 4. account/session RLS disabled
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
WHERE n.nspname='public' AND relname IN ('account','session');
-- Expected: both f (disabled)

-- 5. No policies on account/session
SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('account','session');
-- Expected: 0
```

```sql
-- 6. User UPDATE works (the original break)
BEGIN;
UPDATE "user" SET "updatedAt" = now() WHERE id = '__system__';
ROLLBACK;
-- Must succeed without error
```

```bash
# 7. migrate-status shows all applied
DATABASE_URL='postgres://postgres:9kiQNiq0WbAT89hT@db.cxljcbrygnkobqnyxxeg.supabase.co:5432/postgres' \
  pnpm --filter @hamafx/db migrate:status
# Expected: "All migrations are applied."

# 8. No schema drift (generate produces no diff)
cd /home/ubuntu/HamaFX-Ai && pnpm --filter @hamafx/db migrate:gen
# Expected: no new migration generated (schema matches prod)

# 9. Tests pass
pnpm --filter @hamafx/db test
# Expected: all pass including new idempotency + hash-stability tests

# 10. Typecheck passes
pnpm --filter @hamafx/db typecheck
# Expected: no errors
```

---

## Summary of All Changes

| # | Type | File/Target | Description |
|---|------|-------------|-------------|
| 0.1 | DB | prod | `pg_dump` backup |
| 0.2 | Code | `drizzle.config.ts` | Add `migrationsSchema: 'drizzle'` |
| 0.3 | Code | `migrate-status.mjs` | Fix query schema + hash comparison |
| 0.4 | DB | `drizzle.__drizzle_migrations` | Insert 3 hash-mismatch records |
| 0.5 | DB | prod | Fix `update_updated_at()`, re-create user trigger, disable RLS on account/session |
| 0.6 | DB | `drizzle.__drizzle_migrations` | Insert 18 pending-migration hashes |
| 1.1 | Code | `symbol-catalog.ts` | Add `nDataSymbol` column |
| 1.2 | Code | `diagnostic-traces.ts` | Add `summary`/`metadata`/`created_at`, fix `trace` nullable, fix index names |
| 1.3 | Migration | `0042_*.sql` + journal | Idempotent CREATE TABLE for feature_flags + diagnostic_traces |
| 1.4 | Migration | `0043_*.sql` + journal | Idempotent ADD COLUMN n_data_symbol |
| 1.5 | DB | prod | Apply migrations 0042 + 0043 |
| 1.6 | Code | 9 schema files | Add `tenantId` to 10 global tables (Option A) |
| 1.7 | Migration | `0045_*.sql` + journal | Drop duplicate FTS index |
| 2.1 | Test | `schema-drift.test.ts` | Add idempotency test |
| 2.2 | Test | `migration-hash-stability.test.ts` | New hash-stability guard |
| 2.3 | Code | `predeploy-migrate.mjs` | Add hash-mismatch safety check |
| 2.4 | Docs | `AGENTS.md` | Document migration workflow rules |
