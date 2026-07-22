// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/market/search — symbol search (thin controller).

import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';
import { checkMarketRateLimit, searchSymbolsService } from '@/lib/services/market';

const QuerySchema = z.object({
  q: z.string().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
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
    const { q, limit } = QuerySchema.parse({
      q: url.searchParams.get('q') ?? '',
      limit: url.searchParams.get('limit') ?? undefined,
    });

    const result = searchSymbolsService(q, limit);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
