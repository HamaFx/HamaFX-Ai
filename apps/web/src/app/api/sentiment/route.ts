// SPDX-License-Identifier: Apache-2.0

// /api/sentiment — get aggregated social sentiment for a symbol.
// GET /api/sentiment?symbol=XAUUSD

import { getSentimentService } from '@hamafx/ai';
import { SymbolSchema, AppError } from '@hamafx/shared';
import { withRateLimit } from '@hamafx/db';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SENTIMENT_RATE_LIMIT = Number(process.env.SENTIMENT_RATE_LIMIT) || 30;

export const GET = withAuth<void>(async (req, { user: _user }) => {
  try {
    // RL-5: per-user rate limit on sentiment reads.
    const rl = await withRateLimit(_user.userId, 'sentiment_read', SENTIMENT_RATE_LIMIT);
    if (!rl.allowed) {
      return Response.json(
        { error: { code: 'RATE_LIMITED', message: `Too many requests (${rl.count}/${rl.limit} per minute).` } },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) {
      return errorResponse(new AppError('VALIDATION', 'Missing symbol parameter', 400));
    }

    const parsed = SymbolSchema.safeParse(symbol.toUpperCase());
    if (!parsed.success) {
      return errorResponse(new AppError('VALIDATION', 'Invalid symbol', 400, { issues: parsed.error.issues }));
    }

    const service = getSentimentService();
    const sentiment = await service.getAggregatedSentiment(parsed.data);
    return Response.json({ sentiment });
  } catch (err) {
    return errorResponse(err);
  }
});