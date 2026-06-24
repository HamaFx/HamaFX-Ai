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

// GET /api/market/candles?symbol=XAUUSD&tf=1h&count=300
//
// OHLC window for a single symbol/timeframe. Defaults: tf=1h, count=300.
//
// Phase 7a: response carries `stale: boolean` so the chart / hooks can
// render `<StaleIndicator/>` when the data layer falls back to SWR.

import { getCandlesWithMeta } from '@hamafx/data';
import { DEFAULT_TIMEFRAME, SymbolSchema, TimeframeSchema } from '@hamafx/shared';
import { decryptByok } from '@hamafx/shared/encryption';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { errorResponse, parseSearchParams, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default(DEFAULT_TIMEFRAME),
  count: z.coerce.number().int().min(1).max(5000).default(300),
});

// Phase B: auth-gate. Market data is shared, but the gate prevents
// anonymous scraping. The authenticated `user` is used to load provider preferences.
export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const { symbol, tf, count } = parseSearchParams(req, QuerySchema);

    const db = getDb();
    const [settings] = await db
      .select({
        aiApiKeys: schema.userSettings.aiApiKeys,
        marketDataProvider: schema.userSettings.marketDataProvider,
      })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, user.userId));

    const decrypted = settings?.aiApiKeys ? decryptByok(settings.aiApiKeys) : null;
    const finnhubKey = decrypted?.finnhub ?? '';
    const marketDataProvider = settings?.marketDataProvider ?? 'biquote';

    const r = await getCandlesWithMeta(symbol, tf, {
      count,
      apiKeys: { finnhub: finnhubKey },
      marketDataProvider,
    });
    return Response.json(
      { symbol, tf, candles: r.candles, stale: r.stale, producedAt: r.producedAt },
      {
        headers: {
          // 5 s for 1m last-bar tier; longer tfs are cached internally too,
          // and revalidate twice as long for stale-while-revalidate.
          'cache-control': `private, max-age=0, s-maxage=${tf === '1m' ? 5 : 30}, stale-while-revalidate=300`,
        },
      },
    );
  } catch (err) {
    return errorResponse(err);
  }
});
