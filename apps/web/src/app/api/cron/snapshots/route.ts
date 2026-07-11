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

// GET /api/cron/snapshots — daily HLOC, pivots, ATR, key levels per symbol.
//
// Phase 8 PR-11: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via
// `hamafx-job-snapshots.timer`. The route stays here for hand-triggering
// during a worker outage. The worker version also tail-prunes
// `candles_1m` to the trailing 14 days (this route does not).
//
// Cron schedule: 5 0 * * * UTC (just past midnight, so the previous UTC day
// is fully closed). Idempotent: reruns upsert the same `(symbol, daily, asOf)`
// row in place.
//
// We intentionally use 1H candles for the source window — finer than daily
// (so the OHLC math has real bars) but coarse enough that 240 bars fit
// comfortably in the data layer's free-tier quotas.

import { computeDailySnapshot, previousUtcMidnight, upsertSnapshot } from '@hamafx/ai';
import { getCandles } from '@hamafx/data';
import { SYMBOLS } from '@hamafx/shared';
import * as Sentry from '@sentry/nextjs';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_TF = '1h' as const;
const SOURCE_COUNT = 240; // ~10 days of 1H bars; plenty for ATR14 + PDH/PDL.

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'snapshots' });
  return withCronAuth(req, async () => {
    const asOf = previousUtcMidnight();
    let processed = 0;
    const errors: Array<{ symbol: string; message: string }> = [];

    for (const symbol of SYMBOLS) {
      try {
        const candles = await getCandles(symbol, SOURCE_TF, { count: SOURCE_COUNT });
        const data = computeDailySnapshot({ candles, asOf });
        await upsertSnapshot({ symbol, kind: 'daily', asOf, data });
        processed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ symbol, message });
        // STAB-04 / OBS-01: capture to Sentry, not just stdout.
        Sentry.captureException(err, {
          tags: { job: 'cron/snapshots', symbol },
        });
        log.errorContext(err, 'computeDailySnapshot', { symbol, message });
      }
    }

    return {
      processed,
      ...(errors.length > 0 ? { note: `${errors.length} symbol(s) failed` } : {}),
    };
  });
}
