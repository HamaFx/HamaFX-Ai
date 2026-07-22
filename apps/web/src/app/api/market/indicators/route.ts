// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/market/indicators — compute indicators (thin controller).

import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { checkMarketRateLimit, getIndicatorsService } from '@/lib/services/market';

const BodySchema = z.object({
  symbol: z.string(),
  tf: z.string().default('1h'),
  count: z.number().int().min(1).max(5000).default(300),
  indicators: z
    .array(z.object({ kind: z.string(), params: z.record(z.unknown()).default({}) }))
    .min(1)
    .max(10),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const rl = await checkMarketRateLimit(user.userId);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const { symbol, tf, count, indicators } = await parseJsonBody(req, BodySchema);
    const result = await getIndicatorsService(user.userId, symbol, tf as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', count, indicators);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
