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

// DB-1: Retention cleanup for high-write operational tables.
//
// Shared between the web cron route (Vercel) and the worker job (GCE VM).
// Uses direct DELETE statements — these tables are bounded by retention
// windows (hours to 90 days) and the volumes are manageable with a single
// statement each.

import { getDb } from './client';
import * as schema from './schema/index';
import { lt } from 'drizzle-orm';

export interface RetentionConfig {
  /** Retention window in days for chat_telemetry + tool_telemetry. Default 90. */
  telemetryRetentionDays?: number;
  /** Retention window in days for diagnostic_traces. Default 30. */
  traceRetentionDays?: number;
}

export interface RetentionResult {
  telemetryDeleted: number;
  toolTelemetryDeleted: number;
  tracesDeleted: number;
  rateLimitsDeleted: number;
  providerDailyQuotaDeleted: number;
  note: string;
}

/**
 * Run retention cleanup for all operational tables.
 *
 * - rate_limits: delete window_start < now - 2 hours
 * - chat_telemetry: delete rows older than TELEMETRY_RETENTION_DAYS (default 90)
 * - tool_telemetry: delete rows older than TELEMETRY_RETENTION_DAYS (default 90)
 * - diagnostic_traces: delete rows older than TRACE_RETENTION_DAYS (default 30)
 * - provider_daily_quota: delete day < current_date - 3
 *
 * Idempotent and safe to run repeatedly.
 * Scoped strictly to operational tables — never touches user-content tables
 * (chat_messages, journal, alerts, portfolio).
 */
export async function runRetentionCleanup(
  config: RetentionConfig = {},
): Promise<RetentionResult> {
  const db = getDb();
  const now = new Date();
  const telemetryRetention = config.telemetryRetentionDays ?? 90;
  const traceRetention = config.traceRetentionDays ?? 30;

  const telemetryCutoff = new Date(
    now.getTime() - telemetryRetention * 24 * 60 * 60 * 1000,
  );
  const traceCutoff = new Date(
    now.getTime() - traceRetention * 24 * 60 * 60 * 1000,
  );
  const rateLimitCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const dailyQuotaCutoffStr = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const t1 = await db
    .delete(schema.chatTelemetry)
    .where(lt(schema.chatTelemetry.createdAt, telemetryCutoff));
  const telemetryDeleted = t1.length ?? 0;

  const t2 = await db
    .delete(schema.chatToolTelemetry)
    .where(lt(schema.chatToolTelemetry.createdAt, telemetryCutoff));
  const toolTelemetryDeleted = t2.length ?? 0;

  const t3 = await db
    .delete(schema.diagnosticTraces)
    .where(lt(schema.diagnosticTraces.createdAt, traceCutoff));
  const tracesDeleted = t3.length ?? 0;

  const t4 = await db
    .delete(schema.rateLimits)
    .where(lt(schema.rateLimits.windowStart, rateLimitCutoff));
  const rateLimitsDeleted = t4.length ?? 0;

  const t5 = await db
    .delete(schema.providerDailyQuota)
    .where(lt(schema.providerDailyQuota.day, dailyQuotaCutoffStr));
  const providerDailyQuotaDeleted = t5.length ?? 0;

  return {
    telemetryDeleted,
    toolTelemetryDeleted,
    tracesDeleted,
    rateLimitsDeleted,
    providerDailyQuotaDeleted,
    note: [
      `telemetry=${telemetryDeleted}`,
      `toolTelemetry=${toolTelemetryDeleted}`,
      `traces=${tracesDeleted}`,
      `rateLimits=${rateLimitsDeleted}`,
      `dailyQuota=${providerDailyQuotaDeleted}`,
    ].join(', '),
  };
}
