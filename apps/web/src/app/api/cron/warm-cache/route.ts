// GET /api/cron/warm-cache — pre-fetches the most-used market data so the
// first chat / first chart load of the day is hot. Runs cheap because it
// reuses the same adapters every other read goes through; success populates
// the Next.js Data Cache and the per-instance memory cache for the next
// few minutes.
//
// Schedule: every 2 minutes via the GCE-VM crontab. Idempotent + fast.
// Tight scope on purpose: prices for all 3 symbols + the single most-
// requested candle key (1h × 200). 4h is requested rarely enough that
// burning quota on it inside warm-cache hits the per-provider self-throttle
// AND the upstream's quota — leave it to lazy fetch on first user view.

import { getCandlesWithMeta, getPriceWithMeta } from '@hamafx/data';
import { SYMBOLS } from '@hamafx/shared';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Tight scope on purpose. BiQuote's free tier covers FX + XAU at 10 req/min
 * via our internal self-throttle; warming 3 symbols × 1 tf leaves headroom
 * for the live polling that follows. 4h is fetched lazily on first chart
 * visit.
 */
const TIMEFRAMES_TO_WARM: Array<'1h'> = ['1h'];

/** Stagger candle requests so the throttle sees them spread out. */
const STAGGER_MS = 1500;

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
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ key: `price:${s}`, message });
          console.warn(`[warm-cache] price:${s} failed: ${message}`);
        }
      }),
    );

    // Candles: serialise with a small stagger so the per-provider throttle
    // sees the requests spread out across the window rather than a burst.
    for (const symbol of SYMBOLS) {
      for (const tf of TIMEFRAMES_TO_WARM) {
        try {
          await getCandlesWithMeta(symbol, tf, { count: 200 });
          processed += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push({ key: `candles:${symbol}:${tf}`, message });
          console.warn(`[warm-cache] candles:${symbol}:${tf} failed: ${message}`);
        }
        await new Promise((r) => setTimeout(r, STAGGER_MS));
      }
    }

    return {
      processed,
      ...(errors.length > 0
        ? { note: `${errors.length} key(s) failed: ${errors.map((e) => e.key).join(', ')}` }
        : {}),
    };
  });
}
