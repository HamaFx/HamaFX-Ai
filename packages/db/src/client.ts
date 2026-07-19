/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Drizzle client. Node runtime only — postgres-js does not work on Edge.
// Routes that touch this module must export `runtime = 'nodejs'`.

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

let _client: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

/**
 * Default per-runtime pool size. Phase 2 hardening §4.
 *
 * Web (Vercel): a chat turn fans out into 4 tool calls + a budget
 * reservation + telemetry + message persistence. Pool size 1 serialised
 * all of those, which dragged streaming p95 well above p50. Raise to 5
 * — Vercel's typical concurrent-invocation count per instance — and let
 * Postgres do real concurrency. Multiplied by 25 instances that's still
 * 125 conns, but Supabase's transaction pooler aggregates well below
 * that ceiling because most slots are idle most of the time.
 *
 * Worker: persistent process, fewer concurrent queries (mostly a single
 * tick-flush every second + occasional one-shot job inserts). 3 is
 * plenty.
 *
 * Override either with `DB_POOL_MAX` (web) or `WORKER_DB_POOL_MAX`
 * (worker) for ad-hoc tuning without redeploying.
 */
const DEFAULT_WEB_POOL_MAX = 5;
const DEFAULT_WORKER_POOL_MAX = 3;

function resolvePoolMax(): number {
  // Limit pool to 1 during test execution to prevent exhausting transaction poolers
  if (process.env.NODE_ENV === 'test') return 1;

  // Workers set `HAMAFX_RUNTIME=worker` in the systemd unit's
  // environment file so we can pick the right default without
  // pulling Vercel-specific env vars into @hamafx/db.
  const isWorker = process.env.HAMAFX_RUNTIME === 'worker';
  const envOverride = isWorker ? process.env.WORKER_DB_POOL_MAX : process.env.DB_POOL_MAX;
  if (envOverride) {
    const n = Number(envOverride);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return isWorker ? DEFAULT_WORKER_POOL_MAX : DEFAULT_WEB_POOL_MAX;
}

/**
 * Default per-runtime statement timeout in milliseconds.
 *
 * Web (Vercel): 8 seconds — Vercel Hobby plan has a 10s function timeout
 * and Pro has 60s. A query that takes 7s+ will already consume most of the
 * function budget; failing at 8s ensures the function can still return a
 * structured error to the client instead of being killed mid-query.
 *
 * Worker: 30 seconds — the worker is a persistent process with no
 * function-timeout pressure. Long-running analytics queries (e.g. daily
 * spend rollups, journal stats) are legitimate here.
 */
const DEFAULT_WEB_STATEMENT_TIMEOUT = 8000;
const DEFAULT_WORKER_STATEMENT_TIMEOUT = 30000;

type DbClient = ReturnType<typeof drizzle>;

function resolveStatementTimeout(): number {
  if (process.env.NODE_ENV === 'test') return 30000;
  const isWorker = process.env.HAMAFX_RUNTIME === 'worker';
  return isWorker ? DEFAULT_WORKER_STATEMENT_TIMEOUT : DEFAULT_WEB_STATEMENT_TIMEOUT;
}

/**
 * Lazy-initialised drizzle client. We use a module-scope singleton so cold
 * Vercel functions reuse the same connection pool across invocations within
 * the same Node process.
 */
function resolveSslOptions(): false | { rejectUnauthorized: boolean; ca?: string } {
  // DB_DISABLE_SSL: explicit opt-out of TLS (e.g. Docker Compose, CI).
  // Must be checked FIRST because Next.js statically replaces
  // process.env.NODE_ENV at build time, which means production/non-prod
  // branches get dead-code-eliminated. This custom env var is NOT
  // statically evaluated by Next.js, so it survives the build.
  if (process.env.DB_DISABLE_SSL === 'true') return false;

  const ca = process.env.SUPABASE_CA_CERT?.replace(/\\n/g, '\n').trim();
  if (ca) {
    return {
      ca,
      rejectUnauthorized: true,
    };
  }

  // H-9: In production, TLS verification is mandatory. The
  // DB_ALLOW_INSECURE_TLS escape hatch has been removed — it
  // was a security risk that could leave database traffic
  // unencrypted in production deployments.
  //
  // Supabase pooler rejects non-TLS connections automatically.
  // Self-hosted Postgres should configure TLS; Docker Compose
  // deployments can set DB_DISABLE_SSL=true (which disables
  // TLS entirely) or supply a CA cert via SUPABASE_CA_CERT.
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '*** [db] SECURITY WARNING: DB TLS verification not configured. ***\n' +
      '  Set SUPABASE_CA_CERT with your CA bundle (from Supabase/Self-Host dashboard) for verified TLS.\n' +
      '  The connection will proceed with rejectUnauthorized: false, but this is NOT recommended for production.\n' +
      '  Self-hosters: set up TLS on your Postgres server and provide the CA cert.',
    );
  }

  return { rejectUnauthorized: false };
}

export function getDb(): DbClient {
  if (_client) return _client;

  // Accept DATABASE_URL or POSTGRES_URL (the Supabase Vercel integration
  // provisions POSTGRES_URL on the transaction pooler).
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      'Neither DATABASE_URL nor POSTGRES_URL is set — getDb() called without env config',
    );
  }

  // Supabase pooler in transaction mode requires `prepare: false`. The pooler
  // doesn't support prepared statements; postgres-js otherwise tries to use them.
  //
  // DB-2: TLS verification is now mandatory in production without SUPABASE_CA_CERT.
  // Dev/test and explicit DB_ALLOW_INSECURE_TLS=true opt-out still allow insecure TLS.
  _sql = postgres(url, {
    prepare: false,
    max: resolvePoolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ssl: resolveSslOptions(),
    connection: {
      statement_timeout: resolveStatementTimeout(),
    },
  });

  _client = drizzle(_sql, { schema });
  return _client;
}

/** For tests / scripts only — closes the underlying pool. */
export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
    _client = null;
  }
}

/**
 * Run work inside a transaction that sets the current tenant GUC for future
 * RLS-aware query paths.
 */
/**
 * Whether RLS is enabled for this deployment. When true, `withTenantDb`
 * sets the `app.current_tenant` GUC so RLS policies enforce isolation.
 * When false (self-host / legacy mode), the GUC is not set and policies
 * (if they exist) are bypassed by the connection role.
 *
 * Phase 3 §3.6 — gated behind HAMAFX_ENABLE_RLS env var so self-host
 * editions can skip RLS enforcement without code changes.
 */
const rlsEnabled = process.env.HAMAFX_ENABLE_RLS === 'true' || process.env.HAMAFX_ENABLE_RLS === '1';

/**
 * Run work inside a transaction that sets the current tenant GUC for
 * RLS-aware query paths.
 *
 * Always wraps work in a transaction — callers depend on this for
 * atomic multi-statement writes (e.g., inserting chat messages +
 * telemetry in one unit). When RLS is disabled (self-host / legacy
 * mode), the GUC is not set but the transaction wrapper is preserved.
 *
 * For read-only operations, prefer `withTenantDbRO` which skips the
 * transaction when RLS is disabled.
 */
export async function withTenantDb<T>(
  tenantId: string,
  work: (db: DbClient) => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    if (rlsEnabled) {
      await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    }
    return work(tx as unknown as DbClient);
  });
}

/**
 * Read-only variant of withTenantDb.
 *
 * When RLS is enabled: runs in a READ ONLY transaction with the tenant
 * GUC set. Postgres can optimise read-only transactions (no lock
 * contention, no WAL writes).
 *
 * When RLS is disabled (self-host / legacy mode): skips the transaction
 * entirely and runs directly against the pool — no GUC needed and no
 * atomicity requirement for reads.
 */
export async function withTenantDbRO<T>(
  tenantId: string,
  work: (db: DbClient) => Promise<T>,
): Promise<T> {
  if (!rlsEnabled) {
    return work(getDb());
  }
  return getDb().transaction(async (tx) => {
    // SET TRANSACTION READ ONLY must come before any other statement
    // in the transaction. set_config doesn't modify data so the order
    // is safe, but READ ONLY first is idiomatic.
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
    return work(tx as unknown as DbClient);
  });
}

/**
 * Retry a database operation on transient errors (connection drops,
 * serialization failures, deadlocks). Uses exponential backoff.
 *
 * postgres-js surfaces PostgreSQL errors with a `code` property
 * containing the SQLSTATE value. We check SQLSTATE classes rather
 * than error message strings for reliability across postgres-js
 * versions and locale settings (H5 fix — RELIABILITY_AUDIT_REPORT.md).
 *
 * SQLSTATE classes:
 *   08xxx  — connection exceptions
 *   40P01  — deadlock detected
 *   40001  — serialization failure
 *   57Pxx  — admin shutdown / operator intervention
 *   53300  — too many connections
 *   58P01  — cannot connect to database
 *
 * @param fn — the operation to retry
 * @param maxRetries — max retry attempts (default 3, for 4 total attempts)
 * @param baseDelayMs — initial delay before first retry (default 100ms)
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;

      const code = extractSqlState(err);

      // Retry on SQLSTATE classes:
      //   08xxx — connection exception (connection dropped, broken)
      //   40P01 — deadlock detected
      //   40001 — serialization failure
      //   57Pxx — operator intervention (admin shutdown, restart)
      //   53300 — too many connections
      const retryable =
        code !== null &&
        (code.startsWith('08') ||
          code === '40P01' ||
          code === '40001' ||
          code.startsWith('57') ||
          code === '53300');

      if (!retryable) {
        // Known non-retryable SQLSTATE — throw immediately.
        if (code !== null) throw err;
        // No SQLSTATE code available — fall back to legacy string-matching
        // on error messages (postgres-js may wrap the original error).
        const msg = err instanceof Error ? err.message : String(err);
        if (
          !msg.includes('connection') &&
          !msg.includes('timeout') &&
          !msg.includes('deadlock') &&
          !msg.includes('serialization') &&
          !msg.includes('could not serialize') &&
          !msg.includes('Connection terminated') &&
          !msg.includes('Connection reset') &&
          !msg.includes('connect ECONNREFUSED') &&
          !msg.includes('connect ETIMEDOUT') &&
          !msg.includes('read ECONNRESET')
        ) {
          throw err;
        }
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Extract the SQLSTATE code from a postgres-js error.
 * postgres-js errors have a `code` property (e.g., '08P01', '40P01').
 */
function extractSqlState(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  if (typeof e.code === 'string' && e.code.length === 5) return e.code;
  return null;
}

// ── Phase 3 §3.4 — BYPASSRLS admin client ──────────────────────────────

/**
 * Check database connectivity with a lightweight query.
 * Returns `true` if the database is reachable and responding.
 *
 * Useful for health-check endpoints and pre-flight checks before
 * critical operations. Does NOT throw — returns false on any error.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

let _adminClient: DbClient | null = null;
let _adminSql: ReturnType<typeof postgres> | null = null;

/**
 * Admin DB client that connects as the `hamafx_admin` role (BYPASSRLS).
 *
 * Used by the worker, cron jobs, and migrations for cross-tenant operations
 * that must bypass Row-Level Security. Falls back to the regular `getDb()`
 * when `ADMIN_DATABASE_URL` is not set (self-host / legacy mode).
 *
 * @throws if neither ADMIN_DATABASE_URL nor DATABASE_URL/POSTGRES_URL is set.
 */
export function getAdminDb(): DbClient {
  if (_adminClient) return _adminClient;

  const adminUrl = process.env.ADMIN_DATABASE_URL;
  if (!adminUrl) {
    // Fallback: no admin role configured — use the regular connection.
    // In self-host / legacy mode (no RLS), this is correct.
    return getDb();
  }

  _adminSql = postgres(adminUrl, {
    prepare: false,
    max: resolvePoolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    ssl: resolveSslOptions(),
    connection: {
      statement_timeout: resolveStatementTimeout(),
    },
  });

  _adminClient = drizzle(_adminSql, { schema });
  return _adminClient;
}

/** For tests / scripts only — closes the admin pool. */
export async function closeAdminDb(): Promise<void> {
  if (_adminSql) {
    await _adminSql.end({ timeout: 5 });
    _adminSql = null;
    _adminClient = null;
  }
}

export { schema };
