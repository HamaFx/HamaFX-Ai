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

// POST /api/market/structure
// Body: { symbol, tf, count?, kinds?, lookback? }
//
// Computes Smart Money Concepts events (swings, BOS/CHoCH, FVG, order
// blocks, liquidity sweeps) on a candle window. Outputs ride a separate
// envelope from /api/market/indicators because SMC events are sparse —
// see packages/shared/src/schemas/structure.ts for the rationale.

import { getCandles } from '@hamafx/data';
import { computeStructure } from '@hamafx/indicators';
import {
  DEFAULT_TIMEFRAME,
  StructureKindSchema,
  SymbolSchema,
  TimeframeSchema,
} from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody, rateLimitedResponse, withAuth } from '@/lib/api';
import { withRateLimit } from '@hamafx/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default(DEFAULT_TIMEFRAME),
  count: z.number().int().min(20).max(2000).default(300),
  kinds: z.array(StructureKindSchema).min(1).max(5).optional(),
  /** Swing lookback k (bars on each side). Default 3. */
  lookback: z.number().int().min(1).max(20).default(3),
});

// Phase B: auth-gate. The authenticated `user` is not used inside the
// handler — SMC structures are computed on shared market data — but
// the gate prevents anonymous scraping.
export const POST = withAuth<void>(async (req, { user }) => {
  // Phase 4: rate-limit provider-quota-facing route (30 req/min/user).
  const rl = await withRateLimit(user.userId, 'market_structure', 30);
  if (!rl.allowed) return rateLimitedResponse(rl, req);
  try {
    const { symbol, tf, count, kinds, lookback } = await parseJsonBody(req, BodySchema);
    const candles = await getCandles(symbol, tf, { count });
    const result = computeStructure({
      symbol,
      tf,
      candles,
      ...(kinds ? { kinds } : {}),
      swings: { lookback },
    });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
