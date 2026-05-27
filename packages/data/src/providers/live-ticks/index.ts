// Pseudo-provider that reads the `live_ticks` snapshot table maintained
// by the Phase 8 worker (apps/worker/src/persistence/live-ticks.ts).
//
// Behaviour:
//   - "Healthy" when a row for the requested symbol exists with
//     ts >= now - 60s.
//   - On stale or missing data, throws ProviderError so runWithFailover
//     falls through to the BiQuote REST adapter (and Finnhub / Alpha
//     Vantage after that).
//   - Returns the wire-shape `{ price, provider }` so it can be plugged
//     into the price adapter's existing failover ladder without
//     restructuring the call site.
//
// This module sits in `packages/data/src/providers/live-ticks/` for
// parity with the other providers; the actual schema lives in
// `@hamafx/db` and the writer lives in `apps/worker`.

import type { getDb } from '@hamafx/db';
import { liveTicks } from '@hamafx/db/schema';
import type { Symbol } from '@hamafx/shared';
import { and, eq, gte, sql } from 'drizzle-orm';

import { ProviderError } from '../../errors';

const PROVIDER = 'live-ticks';
/**
 * Maximum age of a `live_ticks` row before we consider the snapshot
 * stale and fall through to the next provider. 60 s is comfortably
 * longer than the worker's 1 Hz flush cadence, so a momentary worker
 * hiccup doesn't cause flapping.
 */
const MAX_AGE_MS = 60_000;

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
}

/**
 * Read the freshest `live_ticks` row for `symbol`. Throws ProviderError
 * if no row exists or the row is older than `maxAgeMs`.
 */
export async function fetchLiveTick(args: FetchLiveTickArgs): Promise<LiveTickResult> {
  const db = args.db ?? (await loadDb());
  const maxAgeMs = args.maxAgeMs ?? MAX_AGE_MS;
  const cutoff = new Date(Date.now() - maxAgeMs);

  const rows = await db
    .select({
      mid: liveTicks.mid,
      ts: liveTicks.ts,
      source: liveTicks.source,
    })
    .from(liveTicks)
    .where(and(eq(liveTicks.symbol, args.symbol), gte(liveTicks.ts, sql`${cutoff}`)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `no fresh live_ticks row for ${args.symbol} (max age ${maxAgeMs}ms)`,
    );
  }

  return {
    price: row.mid,
    // Forward the worker's source tag rather than overwriting it with
    // 'live-ticks' so consumers see whether the underlying tick came from
    // BiQuote SignalR vs. a REST fallback path.
    provider: row.source,
    ts: row.ts.getTime(),
  };
}

/** Lazy-load `getDb` so this module stays import-cheap from the Edge runtime. */
async function loadDb(): Promise<ReturnType<typeof getDb>> {
  const mod = await import('@hamafx/db');
  return mod.getDb();
}
