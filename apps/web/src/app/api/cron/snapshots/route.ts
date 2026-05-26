// GET /api/cron/snapshots — daily HLOC, pivots, ATR, key levels per symbol.
//
// Cron schedule: 5 0 * * * UTC (just past midnight, so the previous UTC day
// is fully closed). Idempotent: reruns upsert the same `(symbol, daily, asOf)`
// row in place.
//
// We intentionally use 1H candles for the source window — finer than daily
// (so the OHLC math has real bars) but coarse enough that 240 bars fit
// comfortably in the data layer's free-tier quotas.

import { computeDailySnapshot, previousUtcMidnight, upsertSnapshot } from '@hamafx/ai';
import { getCandles } from '@hamafx/data';
import { SYMBOLS } from '@hamafx/shared';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_TF = '1h' as const;
const SOURCE_COUNT = 240; // ~10 days of 1H bars; plenty for ATR14 + PDH/PDL.

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const asOf = previousUtcMidnight();
    let processed = 0;
    const errors: Array<{ symbol: string; message: string }> = [];

    for (const symbol of SYMBOLS) {
      try {
        const candles = await getCandles(symbol, SOURCE_TF, { count: SOURCE_COUNT });
        const data = computeDailySnapshot({ candles, asOf });
        await upsertSnapshot({ symbol, kind: 'daily', asOf, data });
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ symbol, message });
        console.error(`[cron snapshots] ${symbol} failed: ${message}`);
      }
    }

    return {
      processed,
      ...(errors.length > 0 ? { note: `${errors.length} symbol(s) failed` } : {}),
    };
  });
}
