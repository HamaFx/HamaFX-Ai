// SPDX-License-Identifier: Apache-2.0

import { listRecentArticles } from '@hamafx/ai';
import { compose, authMiddleware, errorResponse, type RequestUser } from '@/lib/api';
import { withRateLimit } from '@hamafx/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NEWS_RATE_LIMIT = Number(process.env.NEWS_RATE_LIMIT) || 60;

// PF-10 — Migrated to compose() middleware chain.
// The auth check (authMiddleware) runs first, then the handler.
export const GET = compose<void, { user: RequestUser }>(
  authMiddleware<void>(),
  async (req, ctx) => {
    const { user } = ctx;

    try {
      // RL-5: per-user rate limit on news reads.
      const rl = await withRateLimit(user.userId, 'news_read', NEWS_RATE_LIMIT);
      if (!rl.allowed) {
        return Response.json(
          { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }

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
  },
);
