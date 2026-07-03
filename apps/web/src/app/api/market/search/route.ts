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
// Filters by internal symbol, display name, or Twelve Data symbol.

import { BUILTIN_SYMBOLS } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = withAuth<void>(async (req) => {
  try {
    const url = new URL(req.url);
    const { q, limit } = QuerySchema.parse({
      q: url.searchParams.get('q') ?? '',
      limit: url.searchParams.get('limit') ?? undefined,
    });

    const query = q.toUpperCase();
    const results = BUILTIN_SYMBOLS
      .filter((s) =>
        s.internal.includes(query) ||
        s.display.toUpperCase().includes(query) ||
        s.twelveData.toUpperCase().includes(query),
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
