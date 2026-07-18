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
// Uses batched DELETEs with LIMIT to avoid long-running transactions that
// could time out Vercel functions or hold locks for extended periods.

import { getDb } from './client';
import { sql } from 'drizzle-orm';

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
/**
 * Delete rows from a table in batches of `batchSize` to avoid
 * long-running transactions on large tables.
 *
 * Uses `ctid IN (SELECT ctid ... LIMIT $batchSize)` which works on
 * any table regardless of primary key structure.
 */
async function deleteBatched(
  db: ReturnType<typeof getDb>,
  tableName: string,
  whereColumn: string,
  cutoff: string,
  batchSize = 1000,
): Promise<number> {
  let total = 0;
  while (true) {
    const result = await db.execute(
      sql.raw(
        `DELETE FROM "${tableName}" WHERE ctid IN (SELECT ctid FROM "${tableName}" WHERE "${whereColumn}" < '${cutoff}' LIMIT ${batchSize})`,
      ),
    );
    const count = (result as { count?: number }).count ?? 0;
    total += count;
    if (count < batchSize) break;
  }
  return total;
}

export async function runRetentionCleanup(
  config: RetentionConfig = {},
): Promise<RetentionResult> {
  const db = getDb();
  const now = new Date();
  const telemetryRetention = config.telemetryRetentionDays ?? 90;
  const traceRetention = config.traceRetentionDays ?? 30;

  const telemetryCutoff = new Date(
    now.getTime() - telemetryRetention * 24 * 60 * 60 * 1000,
  ).toISOString();
  const traceCutoff = new Date(
    now.getTime() - traceRetention * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rateLimitCutoff = new Date(
    now.getTime() - 2 * 60 * 60 * 1000,
  ).toISOString();
  const dailyQuotaCutoffStr = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const telemetryDeleted = await deleteBatched(
    db, 'chat_telemetry', 'created_at', telemetryCutoff,
  );
  const toolTelemetryDeleted = await deleteBatched(
    db, 'chat_tool_telemetry', 'created_at', telemetryCutoff,
  );
  const tracesDeleted = await deleteBatched(
    db, 'diagnostic_traces', 'created_at', traceCutoff,
  );
  const rateLimitsDeleted = await deleteBatched(
    db, 'rate_limits', 'window_start', rateLimitCutoff,
  );
  // provider_daily_quota has a `day` column of type `date` — use string comparison.
  const providerDailyQuotaDeleted = await deleteBatched(
    db, 'provider_daily_quota', 'day', dailyQuotaCutoffStr,
  );

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

/**
 * Run VACUUM ANALYZE on operational tables to update query planner
 * statistics and reclaim dead tuples. Safe to run on a live database;
 * VACUUM does not block reads or writes.
 *
 * Should be invoked by the nightly cron job AFTER retention cleanup.
 */
export async function runVacuumAnalyze(): Promise<void> {
  const db = getDb();
  // Operational tables that accumulate the most churn.
  const tables = [
    'chat_telemetry',
    'chat_tool_telemetry',
    'rate_limits',
    'provider_daily_quota',
    'diagnostic_traces',
    'chat_messages',
  ];
  for (const table of tables) {
    await db.execute(sql.raw(`VACUUM ANALYZE "${table}"`));
  }
}
