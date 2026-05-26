// GET /api/market/price?symbol=XAUUSD[&symbol=EURUSD]...
//
// Latest mid price for one or more symbols. Browser polls this every 1.5 s;
// the data adapter caches at 3 s so most calls don't hit the upstream.

import { getPrice } from '@hamafx/data';
import { SYMBOLS, SymbolSchema, type Tick } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  // `symbol` may appear once or many times via repeated query params.
  // We accept either a comma-separated string or repeated `?symbol=` pairs.
  symbol: z
    .union([SymbolSchema, z.array(SymbolSchema), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return SYMBOLS.slice();
      if (Array.isArray(v)) return v;
      // CSV form: "XAUUSD,EURUSD"
      const parts = String(v)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const parsed = parts.map((s) => SymbolSchema.parse(s));
      return parsed.length === 0 ? SYMBOLS.slice() : parsed;
    }),
});

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    // Repeated params: collect all `symbol` entries.
    const repeated = url.searchParams.getAll('symbol');
    const params = QuerySchema.parse({
      symbol: repeated.length > 1 ? repeated : (url.searchParams.get('symbol') ?? undefined),
    });

    const ticks: Tick[] = await Promise.all(params.symbol.map((s) => getPrice(s)));
    return Response.json({ ticks }, { headers: cacheHeaders(3) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** CDN-friendly cache headers — short TTL aligned with the data layer. */
function cacheHeaders(ttlSeconds: number): Record<string, string> {
  return {
    'cache-control': `private, max-age=0, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 5}`,
  };
}
