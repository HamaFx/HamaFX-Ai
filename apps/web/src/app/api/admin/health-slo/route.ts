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

// PR-06: SLI/SLO health metrics endpoint for the System Health dashboard.
//
// Computes real-time service level indicators from existing telemetry
// tables. No new data collection — everything is derived from tables
// already populated: chat_telemetry, chat_tool_telemetry, cron_runs,
// live_ticks, and analysis_jobs.
//
// SLO targets are sourced from docs/INCIDENT-RESPONSE.md §2:
//   Chat API:        99.5% success rate (tracked via Sentry, not here)
//   AI Gateway:      99.0% tool success rate
//   Worker/Ticks:    99.9% (measured as tick freshness ≤60s)
//   Cron Jobs:       99.5% completion rate
//   /api/health:     99.9% uptime (not computed here — external probe)
//
// Response includes each SLI's current value, its SLO target,
// the error budget remaining, and any anomalies detected.

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Types ────────────────────────────────────────────────────────────────

interface SliSnapshot {
  /** e.g. "chat_api", "ai_gateway" */
  key: string;
  /** Human-readable label */
  label: string;
  /** Current success rate (0–1) */
  current: number | null;
  /** SLO target success rate (0–1) */
  sloTarget: number;
  /** Window description */
  window: string;
  /** Numerator: successful events */
  success: number;
  /** Denominator: total events */
  total: number;
  /** Error budget remaining (0–1); null if no events or not measurable */
  errorBudget: number | null;
  /** When true, the SLI is informational only — no automated measurement */
  informational?: boolean;
  /** Additional context shown below the gauge */
  details?: string;
}

interface HealthSloResponse {
  ts: string;
  /** DB check latency in ms */
  dbLatencyMs: number;
  /** Whether the DB is reachable */
  dbOk: boolean;
  /** Overall system health based on all SLIs */
  overall: 'healthy' | 'degraded' | 'unhealthy';
  /** Whether Langfuse tracing is active */
  langfuseActive: boolean;
  /** Langfuse base URL (server-populated, safe to expose to admin UI) */
  langfuseBaseUrl: string | null;
  /** Per-service SLI snapshots */
  slis: SliSnapshot[];
  /** Anomalies: stuck cron, stale analysis jobs, stale ticks */
  anomalies: string[];
}

const querySchema = z.object({
  /** Window in hours for SLI computation. Default 24. Max 720 (30 days). */
  hours: z.coerce.number().int().min(1).max(720).default(24),
});

// ── Helpers ──────────────────────────────────────────────────────────────

const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

/** Round a number to 4 decimal places. */
function pct(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Compute an error budget from success rate and SLO target.
 * Error budget = (current - sloTarget) / (1 - sloTarget)
 * Returns 1.0 when current=100%, 0.0 when current=sloTarget, negative when exhausted.
 */
function computeErrorBudget(current: number | null, sloTarget: number): number | null {
  if (current === null) return null;
  if (current >= 1) return 1;
  if (sloTarget >= 1) return current >= 1 ? 1 : 0;
  return pct((current - sloTarget) / (1 - sloTarget));
}

// ── GET Handler ──────────────────────────────────────────────────────────

export const GET = withAdminAuth(async (req) => {
  const { hours } = parseSearchParams(req, querySchema);

  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * ONE_MINUTE);

  const anomalies: string[] = [];

  // ── DB Check ──────────────────────────────────────────────────────────
  let dbOk = false;
  let dbLatencyMs = 0;
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch {
    // DB is unreachable — will be reflected in overall status
  }

  // ── Worker / Tick Freshness ───────────────────────────────────────────
  // If the newest tick is > 60s old, the worker may be struggling or the
  // SignalR consumer is stale. We allow up to 5 min as a grace period
  // (low-activity periods like weekends), but flag > 60s as an anomaly.
  const TICK_FRESH_S = 60; // anomaly threshold
  const TICK_OK_S = 300; // grace period for health status
  let tickOk = false;
  let tickAgeSeconds: number | null = null;
  let tickSymbols = 0;
  try {
    const rows = await db.execute<{ symbol: string; ts: string; age_s: number }>(sql`
      SELECT symbol, ts, EXTRACT(EPOCH FROM (NOW() - ts))::int AS age_s
      FROM live_ticks
      ORDER BY ts DESC
    `);
    tickSymbols = rows.length;
    const newestRow = rows[0];
    if (newestRow) {
      tickAgeSeconds = newestRow.age_s;
      tickOk = tickAgeSeconds <= TICK_OK_S;
      if (tickAgeSeconds > TICK_FRESH_S) {
        anomalies.push(
          `Tick data is stale: newest ${newestRow.symbol} tick is ${tickAgeSeconds}s old (threshold: ${TICK_FRESH_S}s)`,
        );
      }
    } else {
      anomalies.push('No live tick data — worker may not be running');
    }
  } catch {
    // live_ticks table may not exist; non-fatal
  }

  // ── Cron Job Completion Rate ──────────────────────────────────────────
  let cronSuccessRate: number | null = null;
  let cronDone = 0;
  let cronTotal = 0;
  let cronStuck = 0;
  try {
    const [cronRow] = await db.execute<{
      total: string;
      done: string;
      stuck: string;
    }>(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'done')::text AS done,
        COUNT(*) FILTER (
          WHERE status = 'started'
          AND started_at < NOW() - INTERVAL '5 minutes'
        )::text AS stuck
      FROM cron_runs
      WHERE started_at >= ${since}
    `);
    cronTotal = Number(cronRow?.total ?? 0);
    cronDone = Number(cronRow?.done ?? 0);
    cronStuck = Number(cronRow?.stuck ?? 0);
    if (cronTotal > 0) {
      cronSuccessRate = cronDone / cronTotal;
    }
    if (cronStuck > 0) {
      anomalies.push(`${cronStuck} cron job(s) stuck in 'started' > 5 minutes`);
    }
  } catch {
    // cron_runs table may not exist; non-fatal
  }

  // ── AI Gateway / Tool Success Rate ────────────────────────────────────
  let toolSuccessRate: number | null = null;
  let toolOk = 0;
  let toolTotal = 0;
  try {
    const [toolRow] = await db.execute<{ total: string; ok: string }>(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE ok = true)::text AS ok
      FROM chat_tool_telemetry
      WHERE created_at >= ${since}
    `);
    toolTotal = Number(toolRow?.total ?? 0);
    toolOk = Number(toolRow?.ok ?? 0);
    if (toolTotal > 0) {
      toolSuccessRate = toolOk / toolTotal;
    }
  } catch {
    // chat_tool_telemetry table may not exist; non-fatal
  }

  // ── Chat API Turn Count (informational — error tracking via Sentry) ──
  let chatTurns = 0;
  try {
    const [chatRow] = await db.execute<{ turns: string }>(sql`
      SELECT COUNT(*)::text AS turns
      FROM chat_telemetry
      WHERE kind IS NULL AND created_at >= ${since}
    `);
    chatTurns = Number(chatRow?.turns ?? 0);
  } catch {
    // chat_telemetry may not exist; non-fatal
  }

  // ── Analysis Jobs ─────────────────────────────────────────────────────
  let analysisPending = 0;
  let analysisStuck = 0;
  let analysisStale = 0;
  try {
    const [ajRow] = await db.execute<{ pending: string; stale: string; stuck: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
        COUNT(*) FILTER (
          WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '10 minutes'
        )::text AS stale,
        COUNT(*) FILTER (
          WHERE status = 'running'
          AND started_at < NOW() - INTERVAL '30 seconds'
        )::text AS stuck
      FROM analysis_jobs
    `);
    analysisPending = Number(ajRow?.pending ?? 0);
    analysisStale = Number(ajRow?.stale ?? 0);
    analysisStuck = Number(ajRow?.stuck ?? 0);
    if (analysisStale > 0) {
      anomalies.push(`${analysisStale} analysis job(s) pending > 10 minutes — worker may be down`);
    }
    if (analysisStuck > 0) {
      anomalies.push(`${analysisStuck} analysis job(s) stuck in 'running' > 30 seconds`);
    }
  } catch {
    // analysis_jobs may not exist; non-fatal
  }

  // ── Langfuse Tracing ──────────────────────────────────────────────────
  const langfuseActive = Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      process.env.LANGFUSE_BASE_URL,
  );
  // Safe to expose the base URL to the admin dashboard (no secret — just the endpoint address)
  const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL ?? null;

  // ── Build SLIs ────────────────────────────────────────────────────────
  const HOUR_LABEL = hours <= 1 ? '1 hour' : hours <= 24 ? `${hours}h` : `${hours}h (${Math.round(hours / 24)}d)`;

  const slis: SliSnapshot[] = [
    {
      key: 'worker_ticks',
      label: 'Worker / Tick Freshness',
      current: tickSymbols > 0 ? (tickOk ? 1 : 0) : null,
      sloTarget: 0.999,
      window: HOUR_LABEL,
      success: tickOk ? 1 : 0,
      total: tickSymbols > 0 ? 1 : 0,
      errorBudget: tickSymbols > 0 ? (tickOk ? 1 : 0) : null,
      details: tickSymbols > 0 && tickAgeSeconds !== null
        ? `Newest tick ${tickAgeSeconds}s old across ${tickSymbols} symbols`
        : 'No tick data',
    },
    {
      key: 'cron_jobs',
      label: 'Cron Job Completion',
      current: cronSuccessRate,
      sloTarget: 0.995,
      window: HOUR_LABEL,
      success: cronDone,
      total: cronTotal,
      errorBudget: computeErrorBudget(cronSuccessRate, 0.995),
      details: cronTotal > 0 ? `${cronDone}/${cronTotal} completed` : 'No cron runs in window',
    },
    {
      key: 'ai_gateway',
      label: 'AI Tool Gateway',
      current: toolSuccessRate,
      sloTarget: 0.99,
      window: HOUR_LABEL,
      success: toolOk,
      total: toolTotal,
      errorBudget: computeErrorBudget(toolSuccessRate, 0.99),
      details: toolTotal > 0 ? `${toolOk}/${toolTotal} tools succeeded` : 'No tool calls in window',
    },
    {
      key: 'chat_api',
      label: 'Chat API',
      current: chatTurns > 0 ? 1 : null,
      sloTarget: 0.995,
      window: HOUR_LABEL,
      success: chatTurns,
      total: chatTurns,
      errorBudget: null,
      informational: true,
      details: chatTurns > 0
        ? `${chatTurns} turns in window — error rate tracked via Sentry`
        : 'No chat turns in window',
    },
  ];

  // ── Determine Overall Status ──────────────────────────────────────────
  // Priority: DB down → unhealthy; anomalies → degraded; else healthy.
  let overall: HealthSloResponse['overall'] = 'healthy';

  if (!dbOk) {
    overall = 'unhealthy';
  } else if (anomalies.length > 0) {
    overall = 'degraded';
  } else if (
    tickSymbols > 0 &&
    !tickOk &&
    cronTotal > 0 &&
    cronSuccessRate !== null &&
    cronSuccessRate < 0.9
  ) {
    // Multiple services degraded → unhealthy
    overall = 'unhealthy';
  }

  const response: HealthSloResponse = {
    ts: new Date().toISOString(),
    dbLatencyMs,
    dbOk,
    overall,
    langfuseActive,
    langfuseBaseUrl,
    slis,
    anomalies,
  };

  return Response.json(response);
});
