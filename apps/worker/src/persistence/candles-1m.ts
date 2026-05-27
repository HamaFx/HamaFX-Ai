// `candles_1m` writer. Inserts a closed 1-minute bar; idempotent on
// (symbol, t) so worker restarts that re-emit the same bar are safe.
//
// The aggregator drives this via `onClosed`, so writes happen exactly
// once per closed bar — no batching needed. If we ever want batched
// writes (e.g. to amortize Postgres round-trips during weekend gap
// catch-up) we add a small buffer here.

import type { getDb } from '@hamafx/db';
import { candles1m } from '@hamafx/db/schema';

import type { ClosedCandle } from '../aggregator/candle-1m.js';
import type { Logger } from '../log.js';

export interface FlushClosedCandleArgs {
  db: ReturnType<typeof getDb>;
  log: Logger;
  bar: ClosedCandle;
}

/**
 * Persist a single closed 1m bar. Returns silently on success; bubbles up
 * any DB error so the caller decides whether to retry or log + skip.
 */
export async function flushClosedCandle(args: FlushClosedCandleArgs): Promise<void> {
  const { bar } = args;
  await args.db
    .insert(candles1m)
    .values({
      symbol: bar.symbol,
      t: new Date(bar.t),
      o: bar.o,
      h: bar.h,
      l: bar.l,
      c: bar.c,
      v: bar.v,
      tickVolume: bar.tickVolume,
      source: bar.source,
    })
    .onConflictDoNothing();
}
