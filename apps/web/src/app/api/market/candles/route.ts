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

// PF-22 — /api/market/candles — OHLC data (thin controller).

import { errorResponse, parseSearchParams, withAuth } from '@/lib/api';
import { checkMarketRateLimit, getCandlesService } from '@/lib/services/market';
import { z } from 'zod';

const QuerySchema = z.object({
  symbol: z.string(),
  tf: z.string().default('1h'),
  count: z.coerce.number().int().min(1).max(5000).default(300),
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
    const { symbol, tf, count } = parseSearchParams(req, QuerySchema);
    const result = await getCandlesService(user.userId, symbol, tf as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', count);
    return Response.json(result, {
      headers: {
        'cache-control': `private, max-age=0, s-maxage=${tf === '1m' ? 5 : 30}, stale-while-revalidate=300`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
