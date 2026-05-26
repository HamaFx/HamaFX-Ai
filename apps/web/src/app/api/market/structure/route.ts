// POST /api/market/structure
// Body: { symbol, tf, count?, kinds?, lookback? }
//
// Computes Smart Money Concepts events (swings, BOS/CHoCH, FVG, order
// blocks, liquidity sweeps) on a candle window. Outputs ride a separate
// envelope from /api/market/indicators because SMC events are sparse —
// see packages/shared/src/schemas/structure.ts for the rationale.

import { z } from 'zod';

import { getCandles } from '@hamafx/data';
import { computeStructure } from '@hamafx/indicators';
import {
  DEFAULT_TIMEFRAME,
  StructureKindSchema,
  SymbolSchema,
  TimeframeSchema,
} from '@hamafx/shared';

import { errorResponse, parseJsonBody } from '@/lib/api';

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

export async function POST(req: Request): Promise<Response> {
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
}
