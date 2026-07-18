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

// GET /api/market/search?q=EUR&limit=20
//
// Searches BUILTIN_SYMBOLS list locally (no API credit cost).
// Filters by internal symbol or display name.

import { BUILTIN_SYMBOLS } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';
import { withRateLimit } from '@hamafx/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const MARKET_READ_RATE_LIMIT = Number(process.env.MARKET_READ_RATE_LIMIT) || 120;

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    // RL-5: per-user rate limit on market data reads.
    const rl = await withRateLimit(user.userId, 'market_read', MARKET_READ_RATE_LIMIT);
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

    const query = q.toUpperCase();
    const results = BUILTIN_SYMBOLS
      .filter((s) =>
        s.internal.includes(query) ||
        s.display.toUpperCase().includes(query),
      )
      .slice(0, limit)
      .map((s) => ({
        symbol: s.internal,
        display: s.display,
        category: s.category,
      }));

    return Response.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
});
