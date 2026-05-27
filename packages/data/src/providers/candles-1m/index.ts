// Pseudo-provider that reads the `candles_1m` table maintained by the
// Phase 8 worker (apps/worker/src/persistence/candles-1m.ts).
//
// Only relevant for 1-minute candles. For higher timeframes the Vercel
// `/api/market/candles` route asks BiQuote's `/ohlc` REST endpoint
// directly because the worker only persists 1m bars.
//
// Behaviour:
//   - "Healthy" when the newest bar for the symbol is within 90s of now
//     (1.5× the bar size, so a single missed minute on the worker doesn't
//     trip the fallthrough).
//   - On stale or missing data, throws ProviderError so runWithFailover
//     falls through to BiQuote REST → Twelve Data → Finnhub.

import type { getDb } from '@hamafx/db';
import { candles1m } from '@hamafx/db/schema';
import type { Symbol } from '@hamafx/shared';
import { asc, eq } from 'drizzle-orm';

import { ProviderError } from '../../errors';

const PROVIDER = 'candles-1m';
const FRESHNESS_WINDOW_MS = 90_000;

export interface FetchCandles1mArgs {
  symbol: Symbol;
  /** Number of bars to return (oldest-first). */
  count: number;
  /** Inject the drizzle client. Defaults to `getDb()`. */
  db?: ReturnType<typeof getDb>;
  /** Override the freshness window (used by tests). */
  freshnessWindowMs?: number;
}

export interface Candles1mBar {
  /** ms epoch UTC. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number | null;
}

export interface FetchCandles1mResult {
  bars: Candles1mBar[];
  /** Stable string forwarded to the Candle DTO's `source` field. */
  provider: string;
}

/**
 * Read the latest `count` 1m bars for `symbol`, oldest-first. Throws
 * ProviderError if no bars exist or the freshest bar is stale.
 */
export async function fetchCandles1m(args: FetchCandles1mArgs): Promise<FetchCandles1mResult> {
  const db = args.db ?? (await loadDb());
  const window = args.freshnessWindowMs ?? FRESHNESS_WINDOW_MS;
  const limit = Math.max(1, Math.min(args.count, 5000));

  // We pull `limit` newest rows then sort ascending in JS. Drizzle's order +
  // limit support handles this, but doing it in two steps keeps the SQL
  // simple and avoids a dance with `.orderBy(desc(t)).limit(N)` followed
  // by an outer query for the ascending order.
  const rows = await db
    .select({
      t: candles1m.t,
      o: candles1m.o,
      h: candles1m.h,
      l: candles1m.l,
      c: candles1m.c,
      v: candles1m.v,
      source: candles1m.source,
    })
    .from(candles1m)
    .where(eq(candles1m.symbol, args.symbol))
    .orderBy(asc(candles1m.t));

  if (rows.length === 0) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `no candles_1m rows for ${args.symbol}`,
    );
  }

  const newestRow = rows[rows.length - 1];
  if (!newestRow) {
    // unreachable given the length check above, but keeps tsc happy under
    // noUncheckedIndexedAccess.
    throw new ProviderError('PROVIDER_HTTP_ERROR', PROVIDER, 'unexpected empty rows');
  }

  const newest = newestRow.t.getTime();
  const ageMs = Date.now() - newest;
  if (ageMs > window) {
    throw new ProviderError(
      'PROVIDER_HTTP_ERROR',
      PROVIDER,
      `candles_1m stale for ${args.symbol}: newest bar ${ageMs}ms ago`,
    );
  }

  // Take the last `limit` bars (i.e. the most recent window). Already
  // ascending order, so slice from the tail.
  const slice = rows.slice(-limit);
  const provider = newestRow.source;

  return {
    bars: slice.map((r) => ({
      t: r.t.getTime(),
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: r.v,
    })),
    provider,
  };
}

async function loadDb(): Promise<ReturnType<typeof getDb>> {
  const mod = await import('@hamafx/db');
  return mod.getDb();
}
