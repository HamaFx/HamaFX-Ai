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
  const envOverride = isWorker
    ? process.env.WORKER_DB_POOL_MAX
    : process.env.DB_POOL_MAX;
  if (envOverride) {
    const n = Number(envOverride);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return isWorker ? DEFAULT_WORKER_POOL_MAX : DEFAULT_WEB_POOL_MAX;
}

/**
 * Lazy-initialised drizzle client. We use a module-scope singleton so cold
 * Vercel functions reuse the same connection pool across invocations within
 * the same Node process.
 */
export function getDb(): ReturnType<typeof drizzle> {
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
  _sql = postgres(url, {
    prepare: false,
    max: resolvePoolMax(),
    idle_timeout: 20,
    connect_timeout: 10,
    // Recycle long-lived connections every 30 minutes so a misconfigured
    // pool can't slowly burn into Supabase's per-database connection
    // ceiling on a never-restarted Lambda.
    max_lifetime: 60 * 30,
    connection: {
      statement_timeout: 15000, // 15 seconds to prevent rogue queries
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

export { schema };
