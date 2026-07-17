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

// Pseudo-provider that reads the `live_ticks` snapshot table maintained
// by the Phase 8 worker (apps/worker/src/persistence/live-ticks.ts).
//
// Behaviour:
//   - "Healthy" when a row for the requested symbol exists with
//     ts >= now - MAX_AGE_MS.
//   - On stale or missing data, throws ProviderEmptyError so
//     runWithFailover falls through to the BiQuote REST adapter without
//     dinging the live-ticks health score (Phase 2 hardening §2).
//   - Returns the wire-shape `{ price, provider, ts, ageMs }` so the
//     price adapter can surface tick age to the UI / tools (Phase 2
//     hardening §3).
//
// This module sits in `packages/data/src/providers/live-ticks/` for
// parity with the other providers; the actual schema lives in
// `@hamafx/db` and the writer lives in `apps/worker`.

import type { getDb } from '@hamafx/db';
import { liveTicks } from '@hamafx/db/schema';
import type { Symbol } from '@hamafx/shared';
import { and, eq, gte } from 'drizzle-orm';

import { ProviderEmptyError } from '../../errors';

const PROVIDER = 'live-ticks';
/**
 * Maximum age of a `live_ticks` row before we consider the snapshot
 * stale and fall through to the next provider. 5 s is well over the
 * worker's 1 Hz flush cadence — a row older than that means the
 * worker is missing flushes, not just running a beat behind.
 *
 * Phase 2 hardening §3 — the previous 60 s window let the agent quote
 * a 50-second-old price as if it were live. The lower threshold puts
 * a hard ceiling on tick-age that the route handler can surface via
 * the `ageMs` field below.
 *
 * Override with LIVE_TICKS_MAX_AGE_MS env var for load-testing / CI
 * environments where the worker isn't running and live_ticks is
 * seeded statically.
 */
const DEFAULT_MAX_AGE_MS = 5_000;

function resolveMaxAgeMs(override?: number): number {
  if (override !== undefined) return override;
  const env = Number(process.env.LIVE_TICKS_MAX_AGE_MS);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_MAX_AGE_MS;
}

export interface FetchLiveTickArgs {
  symbol: Symbol;
  /** Inject the drizzle client. Defaults to `getDb()` from @hamafx/db. */
  db?: ReturnType<typeof getDb>;
  /** Override the staleness threshold (used by tests). */
  maxAgeMs?: number;
}

export interface LiveTickResult {
  price: number;
  /** Stable string forwarded to the Tick DTO's `source` field. */
  provider: string;
  /** When the worker observed this tick, ms epoch UTC. */
  ts: number;
  /** Milliseconds since the worker observed the tick. Always >= 0. */
  ageMs: number;
}

/**
 * Read the freshest `live_ticks` row for `symbol`. Throws
 * `ProviderEmptyError` (NOT `ProviderError`) if no fresh row exists, so
 * the failover runner falls through without recording a health
 * failure — see Phase 2 hardening §2.
 */
export async function fetchLiveTick(args: FetchLiveTickArgs): Promise<LiveTickResult> {
  const db = args.db ?? (await loadDb());
  const maxAgeMs = resolveMaxAgeMs(args.maxAgeMs);
  const now = Date.now();
  const cutoff = new Date(now - maxAgeMs);

  const rows = await db
    .select({
      mid: liveTicks.mid,
      ts: liveTicks.ts,
      source: liveTicks.source,
    })
    .from(liveTicks)
    .where(and(eq(liveTicks.symbol, args.symbol), gte(liveTicks.ts, cutoff)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ProviderEmptyError(
      PROVIDER,
      `no fresh live_ticks row for ${args.symbol} (max age ${maxAgeMs}ms)`,
    );
  }

  const ts = row.ts.getTime();
  return {
    price: row.mid,
    // Forward the worker's source tag rather than overwriting it with
    // 'live-ticks' so consumers see whether the underlying tick came from
    // BiQuote SignalR vs. a REST fallback path.
    provider: row.source,
    ts,
    ageMs: Math.max(0, now - ts),
  };
}

/** Lazy-load `getDb` so this module stays import-cheap from the Edge runtime. */
async function loadDb(): Promise<ReturnType<typeof getDb>> {
  const mod = await import('@hamafx/db');
  return mod.getDb();
}
