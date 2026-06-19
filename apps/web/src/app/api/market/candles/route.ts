// GET /api/market/candles?symbol=XAUUSD&tf=1h&count=300
//
// OHLC window for a single symbol/timeframe. Defaults: tf=1h, count=300.
//
// Phase 7a: response carries `stale: boolean` so the chart / hooks can
// render `<StaleIndicator/>` when the data layer falls back to SWR.

import { getCandlesWithMeta } from '@hamafx/data';
import { DEFAULT_TIMEFRAME, SymbolSchema, TimeframeSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseSearchParams, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default(DEFAULT_TIMEFRAME),
  count: z.coerce.number().int().min(1).max(5000).default(300),
});

// Phase B: auth-gate. Market data is shared, but the gate prevents
// anonymous scraping. The authenticated `user` is not used inside the
// handler.
export const GET = withAuth<void>(async (req) => {
  try {
    const { symbol, tf, count } = parseSearchParams(req, QuerySchema);
    const r = await getCandlesWithMeta(symbol, tf, { count });
    return Response.json(
      { symbol, tf, candles: r.candles, stale: r.stale, producedAt: r.producedAt },
      {
        headers: {
          // 5 s for 1m last-bar tier; longer tfs are cached internally too,
          // and revalidate twice as long for stale-while-revalidate.
          'cache-control': `private, max-age=0, s-maxage=${tf === '1m' ? 5 : 30}, stale-while-revalidate=300`,
        },
      },
    );
  } catch (err) {
    return errorResponse(err);
  }
});
