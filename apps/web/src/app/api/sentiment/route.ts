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

// /api/sentiment — get aggregated social sentiment for a symbol.
// GET /api/sentiment?symbol=XAUUSD

import { getSentimentService } from '@hamafx/ai';
import { SymbolSchema } from '@hamafx/shared';
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
      return Response.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    const parsed = SymbolSchema.safeParse(symbol.toUpperCase());
    if (!parsed.success) {
      return Response.json({ error: 'Invalid symbol' }, { status: 400 });
    }

    const service = getSentimentService();
    const sentiment = await service.getAggregatedSentiment(parsed.data);
    return Response.json({ sentiment });
  } catch (err) {
    return errorResponse(err);
  }
});