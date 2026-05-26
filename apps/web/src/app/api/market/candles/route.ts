// GET /api/market/candles?symbol=XAUUSD&tf=1h&count=300
//
// OHLC window for a single symbol/timeframe. Defaults: tf=1h, count=300.

import { getCandles } from '@hamafx/data';
import { DEFAULT_TIMEFRAME, SymbolSchema, TimeframeSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default(DEFAULT_TIMEFRAME),
  count: z.coerce.number().int().min(1).max(5000).default(300),
});

export async function GET(req: Request): Promise<Response> {
  try {
    const { symbol, tf, count } = parseSearchParams(req, QuerySchema);
    const candles = await getCandles(symbol, tf, { count });
    return Response.json(
      { symbol, tf, candles },
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
}
