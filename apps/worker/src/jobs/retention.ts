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

// DB-1: Retention cleanup job — runs daily to purge stale rows from
// operational tables (rate_limits, chat_telemetry, tool_telemetry,
// diagnostic_traces, provider_daily_quota).

import { runRetentionCleanup } from '@hamafx/db';

import type { JobContext, JobResult } from './types.js';

export async function runRetention(ctx: JobContext): Promise<JobResult> {
  const result = await runRetentionCleanup();

  ctx.log.info('retention cleanup completed', {
    telemetryDeleted: result.telemetryDeleted,
    toolTelemetryDeleted: result.toolTelemetryDeleted,
    tracesDeleted: result.tracesDeleted,
    rateLimitsDeleted: result.rateLimitsDeleted,
    providerDailyQuotaDeleted: result.providerDailyQuotaDeleted,
  });

  return {
    processed:
      result.telemetryDeleted +
      result.toolTelemetryDeleted +
      result.tracesDeleted +
      result.rateLimitsDeleted +
      result.providerDailyQuotaDeleted,
    note: result.note,
  };
}
