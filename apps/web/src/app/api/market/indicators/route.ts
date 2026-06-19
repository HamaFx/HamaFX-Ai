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

import { getCandles } from '@hamafx/data';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default(DEFAULT_TIMEFRAME),
  count: z.number().int().min(1).max(5000).default(300),
  indicators: z
    .array(z.object({ kind: IndicatorKindSchema, params: IndicatorParamsSchema.default({}) }))
    .min(1)
    .max(10),
});

// Phase B: auth-gate. The authenticated `user` is not used inside the
// handler — indicators are computed on shared market data — but the
// gate prevents anonymous scraping.
export const POST = withAuth<void>(async (req) => {
  try {
    const { symbol, tf, count, indicators } = await parseJsonBody(req, BodySchema);
    const candles = await getCandles(symbol, tf, { count });

    const results: IndicatorResult[] = indicators.map(({ kind, params }) =>
      computeIndicator({ symbol, tf, kind, params, candles }),
    );

    return Response.json({ symbol, tf, count: candles.length, candles, results });
  } catch (err) {
    return errorResponse(err);
  }
});
