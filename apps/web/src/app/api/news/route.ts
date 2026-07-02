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

import { listRecentArticles } from '@hamafx/ai';
import { withRateLimit } from '@hamafx/db';
import { errorResponse, rateLimitedResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  // Phase 4: rate-limit provider-quota-facing route (30 req/min/user).
  const rl = await withRateLimit(user.userId, 'news', 30);
  if (!rl.allowed) return rateLimitedResponse(rl, req);
  try {
        const url = new URL(req.url);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
    const sentiment = url.searchParams.get('sentiment') ?? undefined;
    const symbol = url.searchParams.get('symbol') ?? undefined;
    const query = url.searchParams.get('q') ?? undefined;

    const safeOffset = isNaN(offset) || offset < 0 ? 0 : offset;
    const safeLimit = isNaN(limit) || limit < 1 || limit > 100 ? 20 : limit;

    const filters: { sentiment?: string; symbol?: string; query?: string } = {};
    if (sentiment !== undefined) filters.sentiment = sentiment;
    if (symbol !== undefined) filters.symbol = symbol;
    if (query !== undefined) filters.query = query;

    // Fetch safeLimit + 1 and slice it if it exists.
    const articlesWithOneExtra = await listRecentArticles(safeLimit + 1, safeOffset, filters);
    const hasMore = articlesWithOneExtra.length > safeLimit;
    const items = articlesWithOneExtra.slice(0, safeLimit);

    return Response.json({
      items,
      hasMore,
      nextOffset: safeOffset + items.length,
    });
  } catch (err) {
    return errorResponse(err, req);
  }
});
