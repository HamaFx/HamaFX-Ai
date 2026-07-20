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
