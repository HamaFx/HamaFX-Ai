/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// GET /api/market/price?symbol=XAUUSD[&symbol=EURUSD]...
//
// Latest mid price for one or more symbols. Browser polls this every 1.5 s;
// the data adapter caches at 3 s so most calls don't hit the upstream.
//
// Phase 7a: when the data layer falls back to a stale-while-error cached
// value, the response carries `stale: true` per symbol AND a top-level
// `anyStale` flag so the UI can show `<StaleIndicator/>` without iterating.

import { getPriceWithMeta } from '@hamafx/data';
import { SYMBOLS, SymbolSchema, type Tick } from '@hamafx/shared';
import { decryptByok } from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';

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

interface TickWithMeta extends Tick {
  /** True iff served from a stale-while-error fallback. */
  stale: boolean;
  /** ms epoch UTC the upstream produced this value. */
  producedAt: number;
  /**
   * Phase 2 hardening §3 — milliseconds since the worker observed the
   * tick. Only meaningful when the live-ticks provider served the
   * value; `null` for REST fallbacks. The chart UI / chat tools
   * should refuse to quote a value with `ageMs > 5000` as live.
   */
  ageMs: number | null;
}

// Phase B: auth-gate. Market data is shared, but the gate prevents
// anonymous scraping. The authenticated `user` is used to load provider preferences.
export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    // Repeated params: collect all `symbol` entries.
    const repeated = url.searchParams.getAll('symbol');
    const params = QuerySchema.parse({
      symbol: repeated.length > 1 ? repeated : (url.searchParams.get('symbol') ?? undefined),
    });

    const db = getDb();
    const [settings] = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        marketDataProvider: schema.userSettings.marketDataProvider,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));

    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
    const finnhubKey = decrypted?.finnhub ?? '';
    const twelvedataKey = decrypted?.twelvedata ?? process.env.TWELVEDATA_API_KEY ?? '';
    const marketDataProvider = settings?.marketDataProvider ?? 'biquote';

    const results = await Promise.all(
      params.symbol.map((s) =>
        getPriceWithMeta(s, {
          apiKeys: { finnhub: finnhubKey, twelvedata: twelvedataKey },
          marketDataProvider,
        })
      )
    );
    const ticks: TickWithMeta[] = results.map((r) => ({
      ...r.tick,
      stale: r.stale,
      producedAt: r.producedAt,
      ageMs: r.ageMs,
    }));
    const anyStale = ticks.some((t) => t.stale);
    return Response.json(
      { ticks, anyStale },
      { headers: cacheHeaders(3) },
    );
  } catch (err) {
    return errorResponse(err);
  }
});

/** CDN-friendly cache headers — short TTL aligned with the data layer. */
function cacheHeaders(ttlSeconds: number): Record<string, string> {
  return {
    'cache-control': `private, max-age=0, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 5}`,
  };
}
