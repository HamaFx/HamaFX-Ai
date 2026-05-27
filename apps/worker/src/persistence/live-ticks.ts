// `live_ticks` writer. Drains the in-memory tick buffer and UPSERTs each
// symbol's latest tick into Postgres. Designed to be called on a steady
// 1 Hz interval — Supabase Free easily handles 3 UPSERTs/sec on a
// 3-row table.
//
// Phase 8 PR-6 — feeds the snapshot table the Vercel `/api/market/price`
// route will read in PR-8. Until PR-8 lands, this code path simply makes
// the data available for inspection in the DB.

import type { getDb } from '@hamafx/db';
import { liveTicks } from '@hamafx/db/schema';
import { sql } from 'drizzle-orm';

import type { Logger } from '../log.js';
import type { NormalizedTick } from '../signalr/consumer.js';
import type { TickBuffer } from '../signalr/tick-buffer.js';

export interface LiveTicksWriterArgs {
  /** Drizzle client. Caller owns the lifecycle. */
  db: ReturnType<typeof getDb>;
  buffer: TickBuffer;
  log: Logger;
}

/**
 * Drain the buffer once and UPSERT each symbol's latest tick.
 *
 * Returns a small summary so callers can log throughput. Errors in the DB
 * write bubble up — the caller (the flush loop) decides whether to retry
 * or log + continue.
 */
export async function flushLiveTicks(args: LiveTicksWriterArgs): Promise<{
  written: number;
  totalTicks: number;
}> {
  const drained = args.buffer.drain();
  if (drained.length === 0) return { written: 0, totalTicks: 0 };

  const totalTicks = drained.reduce((sum, d) => sum + d.observed, 0);
  const rows = drained.map(({ tick }) => toRow(tick));

  // ON CONFLICT (symbol) DO UPDATE — the symbol is the PK, so we collapse
  // to a single row per instrument. `updated_at` is bumped via DEFAULT now()
  // on the conflict path too.
  await args.db
    .insert(liveTicks)
    .values(rows)
    .onConflictDoUpdate({
      target: liveTicks.symbol,
      set: {
        bid: sql`excluded.bid`,
        ask: sql`excluded.ask`,
        mid: sql`excluded.mid`,
        ts: sql`excluded.ts`,
        source: sql`excluded.source`,
        updatedAt: sql`now()`,
      },
    });

  return { written: rows.length, totalTicks };
}

interface LiveTickRow {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  ts: Date;
  source: string;
}

function toRow(tick: NormalizedTick): LiveTickRow {
  return {
    symbol: tick.symbol,
    bid: tick.bid,
    ask: tick.ask,
    mid: tick.mid,
    // The DB column is timestamptz — convert from ms epoch.
    ts: new Date(tick.ts),
    source: tick.source,
  };
}
