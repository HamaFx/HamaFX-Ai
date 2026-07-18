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

// POST /api/market/indicators
// Body: { symbol, tf?, count?, indicators: [{ kind, params? }] }
//
// Computes one or more indicators against the same candle window so the
// chart UI can ask for "EMA 20 + EMA 50 + RSI 14" in a single round-trip.
//
// Results are cached server-side for 30 seconds because indicator values
// don't change between successive requests for the same candle window.
// The cache key includes symbol + timeframe + count + indicator list so
// different indicator combinations are independently cached.

import { getCandles, getDefaultCache, cacheKey } from '@hamafx/data';
import { computeIndicator } from '@hamafx/indicators';
import {
  DEFAULT_TIMEFRAME,
  IndicatorKindSchema,
  IndicatorParamsSchema,
  SymbolSchema,
  TimeframeSchema,
  type IndicatorResult,
} from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { withRateLimit } from '@hamafx/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Indicator results are cached for 30 seconds. Indicator values don't
 * change between requests for the same candle window, and candles
 * themselves are cached at the data layer. A 30-second TTL dramatically
 * reduces repeated compute for rapidly-polling chart UIs. */
const INDICATOR_CACHE_TTL = 30;

const BodySchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default(DEFAULT_TIMEFRAME),
  count: z.number().int().min(1).max(5000).default(300),
  indicators: z
    .array(z.object({ kind: IndicatorKindSchema, params: IndicatorParamsSchema.default({}) }))
    .min(1)
    .max(10),
});

const MARKET_READ_RATE_LIMIT = Number(process.env.MARKET_READ_RATE_LIMIT) || 120;

// Phase B: auth-gate. The authenticated `user` is not used inside the
// handler — indicators are computed on shared market data — but the
// gate prevents anonymous scraping.
export const POST = withAuth<void>(async (req, { user }) => {
  try {
    // RL-5: per-user rate limit on market data reads.
    const rl = await withRateLimit(user.userId, 'market_read', MARKET_READ_RATE_LIMIT);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const { symbol, tf, count, indicators } = await parseJsonBody(req, BodySchema);

    // Build a stable cache key from the full request signature so each
    // distinct indicator combination caches independently.
    const key = cacheKey({
      resource: 'indicator',
      symbol,
      tf,
      extra: `${count}:${indicators.map((i) => i.kind).join(',')}`,
    });
    const cache = await getDefaultCache();

    const { value: resultData } = await cache.fetchWithMeta<{
      candles: unknown;
      results: IndicatorResult[];
    }>(
      key,
      async () => {
        const candles = await getCandles(symbol, tf, { count });
        const results: IndicatorResult[] = indicators.map(({ kind, params }) =>
          computeIndicator({ symbol, tf, kind, params, candles }),
        );
        return { candles, results };
      },
      { ttlSeconds: INDICATOR_CACHE_TTL },
    );

    return Response.json({
      symbol,
      tf,
      count: (resultData.candles as unknown[]).length,
      candles: resultData.candles,
      results: resultData.results,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
