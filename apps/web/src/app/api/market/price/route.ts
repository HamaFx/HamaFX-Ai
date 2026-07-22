// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/market/price — latest prices (thin controller).

import { SYMBOLS } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';
import { checkMarketRateLimit, getPriceService } from '@/lib/services/market';

const QuerySchema = z.object({
  symbol: z
    .union([z.string(), z.array(z.string()), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return SYMBOLS.slice();
      if (Array.isArray(v)) return v;
      const parts = String(v).split(',').map((s) => s.trim()).filter(Boolean);
      return parts.length === 0 ? SYMBOLS.slice() : parts;
    }),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const rl = await checkMarketRateLimit(user.userId);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const url = new URL(req.url);
    const repeated = url.searchParams.getAll('symbol');
    const params = QuerySchema.parse({
      symbol: repeated.length > 1 ? repeated : (url.searchParams.get('symbol') ?? undefined),
    });

    const result = await getPriceService(user.userId, params.symbol);
    return Response.json(result, {
      headers: { 'cache-control': `private, max-age=0, s-maxage=3, stale-while-revalidate=15` },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
