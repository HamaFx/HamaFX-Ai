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

// GET /api/cron/alerts — evaluates active, unfired alerts against the
// latest cached prices/indicators, fires email notifications via Resend,
// marks fired_at + sets active=false. Idempotent under repeat firing
// because we only consider rows with firedAt IS NULL.
//
// Cadence: 1 min on Pro (`vercel.json` crons), 5 min on Hobby external
// scheduler. The eval is fast (one cached price call per priceCross + one
// candle call per (symbol, tf) deduped via the data cache).

import { evaluateAlerts } from '@hamafx/ai';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const result = await evaluateAlerts({ ...(req.signal ? { signal: req.signal } : {}) });

    // OBS-04 (Phase 5.3): Capture per-alert errors to Sentry + pino logger
    if (result.errors.length > 0) {
      const log = createScopedLoggerWithContext({ component: 'cron', job: 'alerts' });
      for (const alertErr of result.errors) {
        log.error({ err: String(alertErr) }, 'alert evaluation error');
      }
    }

    const errs = result.errors.length ? `, errors=${result.errors.length}` : '';
    return {
      processed: result.total,
      note: `matched=${result.matched} fired=${result.fired} skipped=${result.skipped}${errs}`,
    };
  });
}
