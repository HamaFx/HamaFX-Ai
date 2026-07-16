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

// DB-1: GET /api/cron/cleanup-telemetry — purges stale operational rows.
//
// Targets: rate_limits, chat_telemetry, tool_telemetry, diagnostic_traces,
// provider_daily_quota. Uses shared retention logic from @hamafx/db so
// both the web cron route and the worker job call the same function.
//
// Schedule: daily via Vercel cron or the GCE VM systemd timer.

import { runRetentionCleanup } from '@hamafx/db';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'cleanup-telemetry' });
  return withCronAuth(req, async () => {
    const result = await runRetentionCleanup();

    log.info('retention cleanup completed', {
      telemetryDeleted: result.telemetryDeleted,
      toolTelemetryDeleted: result.toolTelemetryDeleted,
      tracesDeleted: result.tracesDeleted,
      rateLimitsDeleted: result.rateLimitsDeleted,
      providerDailyQuotaDeleted: result.providerDailyQuotaDeleted,
    });

    return { processed: result.telemetryDeleted + result.toolTelemetryDeleted + result.tracesDeleted + result.rateLimitsDeleted + result.providerDailyQuotaDeleted, note: result.note };
  });
}
