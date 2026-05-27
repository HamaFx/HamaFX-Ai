// GET /api/cron/warm-cache — pre-fetches the most-used market data so the
// first chat / first chart load of the day is hot. Runs cheap because it
// reuses the same adapters every other read goes through; success populates
// the Next.js Data Cache and the per-instance memory cache for the next
// few minutes.
//
// Schedule: every 2 minutes via the GCE-VM crontab. Idempotent + fast.
// We deliberately fetch only PRICE for all 3 symbols and the two most
// common candle keys (1h × 200 and 4h × 200) — anything heavier should
// stay reactive.

import { getCandlesWithMeta, getPriceWithMeta } from '@hamafx/data';
import { SYMBOLS } from '@hamafx/shared';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TIMEFRAMES_TO_WARM: Array<'1h' | '4h'> = ['1h', '4h'];

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const errors: Array<{ key: string; message: string }> = [];
    let processed = 0;

    // Prices: parallel — three symbols, one upstream provider.
    await Promise.all(
      SYMBOLS.map(async (s) => {
        try {
          await getPriceWithMeta(s);
          processed += 1;
        } catch (err) {
          errors.push({
            key: `price:${s}`,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    // Candles: serialise per (symbol, tf) to keep upstream throttle happy.
    for (const symbol of SYMBOLS) {
      for (const tf of TIMEFRAMES_TO_WARM) {
        try {
          await getCandlesWithMeta(symbol, tf, { count: 200 });
          processed += 1;
        } catch (err) {
          errors.push({
            key: `candles:${symbol}:${tf}`,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return {
      processed,
      ...(errors.length > 0 ? { note: `${errors.length} key(s) failed to warm` } : {}),
    };
  });
}
