// SPDX-License-Identifier: Apache-2.0

// PR-06: Admin health SLO service.
//
// Computes real-time service level indicators from existing telemetry
// tables. No new data collection — everything is derived from tables
// already populated: chat_telemetry, chat_tool_telemetry, cron_runs,
// live_ticks, and analysis_jobs.

import { sql } from 'drizzle-orm';

import type { SQLWrapper } from 'drizzle-orm';

import type { HealthSloResponse, SliSnapshot } from './admin-dtos';

export interface ComputeHealthSloOptions {
  hours: number;
}

/** Minimal DB surface needed by the health service. */
/** Helper: extract rows from db.execute() which returns {rows: [...]} across all drivers. */
function extractRows(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === 'object' && 'rows' in result && Array.isArray((result as Record<string, unknown>).rows)) {
    return (result as Record<string, unknown>).rows as Record<string, unknown>[];
  }
  return [];
}

/** Minimal DB surface needed by the health service. */
export interface HealthSloDb {
  execute: (query: string | SQLWrapper) => Promise<unknown>;
}

interface TickAggregate {
  symbolCount: number;
  oldestAgeSeconds: number | null;
}

interface CronAggregate {
  total: number;
  done: number;
  stuck: number;
}

interface ToolAggregate {
  total: number;
  ok: number;
}

interface ChatAggregate {
  turns: number;
}

interface AnalysisAggregate {
  stale: number;
  stuck: number;
}

interface OperationalAggregate {
  fullTotal: number;
  fullCompleted: number;
  fullFailed: number;
  sentimentTotal: number;
  sentimentSucceeded: number;
  outboxTerminal: number;
  outboxCompleted: number;
  outboxDead: number;
  budgetTerminal: number;
  budgetErrors: number;
  traceTotal: number;
  traceFailed: number;
  providerFallbackTraces: number;
}

const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

function pct(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function computeErrorBudget(current: number | null, sloTarget: number): number | null {
  if (current === null) return null;
  if (current >= 1) return 1;
  if (sloTarget >= 1) return current >= 1 ? 1 : 0;

  // Error budget is remaining budget, not an unbounded score. Once the
  // target is missed the budget is exhausted and must render as 0, rather
  // than a negative percentage that the UI would clamp inconsistently.
  return pct(Math.max(0, Math.min(1, (current - sloTarget) / (1 - sloTarget))));
}

/**
 * Compute the current health SLO snapshot.
 *
 * Independent telemetry queries are executed concurrently with
 * Promise.allSettled. A rejected settlement is treated the same as the
 * original per-query try/catch: the table is assumed missing/empty and
 * that SLI falls back to null/0, so one missing table cannot break the
 * rest of the dashboard.
 */
export async function computeHealthSloService(
  db: HealthSloDb,
  { hours }: ComputeHealthSloOptions,
): Promise<HealthSloResponse> {
  const since = new Date(Date.now() - hours * 60 * ONE_MINUTE);

  // ── DB probe (kept separate; it drives overall status) ───────────────────
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

  // ── Independent telemetry queries (concurrent) ────────────────────────────
  const [ticksResult, cronResult, toolResult, chatResult, analysisResult, operationalResult] = await Promise.allSettled([
    queryTickAggregate(db),
    queryCronAggregate(db, since),
    queryToolAggregate(db, since),
    queryChatAggregate(db, since),
    queryAnalysisAggregate(db, since),
    queryOperationalAggregate(db, since),
  ]);

  const ticks = ticksResult.status === 'fulfilled' ? ticksResult.value : null;
  const cron = cronResult.status === 'fulfilled' ? cronResult.value : null;
  const tools = toolResult.status === 'fulfilled' ? toolResult.value : null;
  const chat = chatResult.status === 'fulfilled' ? chatResult.value : null;
  const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null;
  const operational = operationalResult.status === 'fulfilled' ? operationalResult.value : null;

  const anomalies: string[] = [];

  // ── Build tick SLI / anomaly ────────────────────────────────────────────
  const TICK_FRESH_S = 60;
  const TICK_OK_S = 300;
  let tickOk = false;
  let tickAgeSeconds: number | null = null;
  let tickSymbolCount = 0;

  if (ticks) {
    tickSymbolCount = ticks.symbolCount;
    tickAgeSeconds = ticks.oldestAgeSeconds;
    if (tickAgeSeconds !== null) {
      tickOk = tickAgeSeconds <= TICK_OK_S;
      if (tickAgeSeconds > TICK_FRESH_S) {
        anomalies.push(
          `Tick data is stale: oldest symbol tick is ${tickAgeSeconds}s old (threshold: ${TICK_FRESH_S}s)`,
        );
      }
    } else {
      anomalies.push('No live tick data — worker may not be running');
    }
  } else {
    anomalies.push('Tick telemetry is unavailable — worker health cannot be verified');
  }

  // ── Build cron SLI / anomaly ──────────────────────────────────────────────
  let cronSuccessRate: number | null = null;
  if (cron) {
    if (cron.total > 0) {
      cronSuccessRate = cron.done / cron.total;
      if (cronSuccessRate < 0.995) {
        anomalies.push(
          `Cron completion is below SLO: ${cron.done}/${cron.total} completed (target: 99.5%)`,
        );
      }
    } else {
      anomalies.push('No cron runs in the selected window — cron health cannot be verified');
    }
    if (cron.stuck > 0) {
      anomalies.push(`${cron.stuck} cron job(s) stuck in 'started' > 5 minutes`);
    }
  } else {
    anomalies.push('Cron telemetry is unavailable — cron health cannot be verified');
  }

  // ── Build AI gateway SLI ────────────────────────────────────────────────
  let toolSuccessRate: number | null = null;
  if (tools && tools.total > 0) {
    toolSuccessRate = tools.ok / tools.total;
    if (toolSuccessRate < 0.99) {
      anomalies.push(
        `AI tool success is below SLO: ${tools.ok}/${tools.total} succeeded (target: 99%)`,
      );
    }
  } else if (!tools) {
    anomalies.push('AI tool telemetry is unavailable — gateway health cannot be verified');
  } else {
    anomalies.push('No AI tool calls in the selected window — gateway health cannot be verified');
  }

  // ── Build chat API count ────────────────────────────────────────────────
  const chatTurns = chat?.turns ?? 0;
  if (!chat) {
    anomalies.push('Chat telemetry is unavailable — chat health cannot be verified');
  } else if (chatTurns === 0) {
    anomalies.push('No chat turns in the selected window — chat health cannot be verified');
  }

  // ── Build analysis anomalies ────────────────────────────────────────────
  if (analysis) {
    if (analysis.stale > 0) {
      anomalies.push(`${analysis.stale} analysis job(s) pending > 10 minutes — worker may be down`);
    }
    if (analysis.stuck > 0) {
      anomalies.push(`${analysis.stuck} analysis job(s) stuck in 'running' > 30 seconds`);
    }
  }

  // ── Recovery / Full-mode operational signals ───────────────────────────
  if (!operational) {
    anomalies.push('Recovery telemetry is unavailable — outbox, budget, trace, and Full-mode health cannot be verified');
  } else {
    if (operational.fullTotal > 0 && operational.fullCompleted / operational.fullTotal < 0.995) {
      anomalies.push(`Full-mode completion is below SLO: ${operational.fullCompleted}/${operational.fullTotal} completed`);
    }
    if (operational.sentimentTotal > 0 && operational.sentimentSucceeded / operational.sentimentTotal < 0.95) {
      anomalies.push(`Sentiment specialist success is below SLO: ${operational.sentimentSucceeded}/${operational.sentimentTotal} succeeded`);
    }
    if (operational.outboxDead > 0) {
      anomalies.push(`${operational.outboxDead} persistence outbox record(s) are dead-lettered`);
    }
    if (operational.budgetErrors > 0) {
      anomalies.push(`${operational.budgetErrors} budget reservation(s) have recovery errors`);
    }
    if (operational.traceFailed > 0) {
      anomalies.push(`${operational.traceFailed} diagnostic trace(s) failed to complete`);
    }
  }

  // ── Langfuse ────────────────────────────────────────────────────────────
  const langfuseActive = Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      process.env.LANGFUSE_BASE_URL,
  );
  const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL ?? null;

  // ── Build SLIs ───────────────────────────────────────────────────────────
  const HOUR_LABEL = hours <= 1 ? '1 hour' : hours <= 24 ? `${hours}h` : `${hours}h (${Math.round(hours / 24)}d)`;

  const operationalSlis: SliSnapshot[] = operational
    ? [
        {
          key: 'full_mode_completion',
          label: 'Full-mode Completion',
          current: operational.fullTotal > 0 ? operational.fullCompleted / operational.fullTotal : null,
          sloTarget: 0.995,
          window: HOUR_LABEL,
          success: operational.fullCompleted,
          total: operational.fullTotal,
          errorBudget: computeErrorBudget(operational.fullTotal > 0 ? operational.fullCompleted / operational.fullTotal : null, 0.995),
          details: `${operational.fullCompleted}/${operational.fullTotal} Full-mode jobs completed`,
        },
        {
          key: 'sentiment_health',
          label: 'Sentiment Specialist',
          current: operational.sentimentTotal > 0 ? operational.sentimentSucceeded / operational.sentimentTotal : null,
          sloTarget: 0.95,
          window: HOUR_LABEL,
          success: operational.sentimentSucceeded,
          total: operational.sentimentTotal,
          errorBudget: computeErrorBudget(operational.sentimentTotal > 0 ? operational.sentimentSucceeded / operational.sentimentTotal : null, 0.95),
          details: `${operational.sentimentSucceeded}/${operational.sentimentTotal} sentiment calls succeeded`,
        },
        {
          key: 'persistence_outbox',
          label: 'Persistence Recovery',
          current: operational.outboxTerminal > 0 ? operational.outboxCompleted / operational.outboxTerminal : null,
          sloTarget: 0.999,
          window: HOUR_LABEL,
          success: operational.outboxCompleted,
          total: operational.outboxTerminal,
          errorBudget: computeErrorBudget(operational.outboxTerminal > 0 ? operational.outboxCompleted / operational.outboxTerminal : null, 0.999),
          details: `${operational.outboxCompleted} completed, ${operational.outboxDead} dead-lettered`,
        },
        {
          key: 'budget_recovery',
          label: 'Budget Recovery',
          current: operational.budgetTerminal > 0 ? 1 - operational.budgetErrors / operational.budgetTerminal : null,
          sloTarget: 0.999,
          window: HOUR_LABEL,
          success: operational.budgetTerminal - operational.budgetErrors,
          total: operational.budgetTerminal,
          errorBudget: computeErrorBudget(operational.budgetTerminal > 0 ? 1 - operational.budgetErrors / operational.budgetTerminal : null, 0.999),
          details: `${operational.budgetErrors} recovery errors across ${operational.budgetTerminal} terminal reservations`,
        },
        {
          key: 'trace_sink',
          label: 'Diagnostic Trace Sink',
          current: operational.traceTotal > 0 ? (operational.traceTotal - operational.traceFailed) / operational.traceTotal : null,
          sloTarget: 0.999,
          window: HOUR_LABEL,
          success: operational.traceTotal - operational.traceFailed,
          total: operational.traceTotal,
          errorBudget: computeErrorBudget(operational.traceTotal > 0 ? (operational.traceTotal - operational.traceFailed) / operational.traceTotal : null, 0.999),
          details: `${operational.traceFailed} failed of ${operational.traceTotal} traces`,
        },
        {
          key: 'provider_fallback_free',
          label: 'Provider Fallback-free',
          current: operational.traceTotal > 0 ? 1 - operational.providerFallbackTraces / operational.traceTotal : null,
          sloTarget: 0.95,
          window: HOUR_LABEL,
          success: operational.traceTotal - operational.providerFallbackTraces,
          total: operational.traceTotal,
          errorBudget: computeErrorBudget(operational.traceTotal > 0 ? 1 - operational.providerFallbackTraces / operational.traceTotal : null, 0.95),
          details: `${operational.providerFallbackTraces} trace(s) used provider fallback`,
        },
      ]
    : [];

  const slis: SliSnapshot[] = [
    {
      key: 'worker_ticks',
      label: 'Worker / Tick Freshness',
      current: tickSymbolCount > 0 ? (tickOk ? 1 : 0) : null,
      sloTarget: 0.999,
      window: 'current',
      success: tickOk ? 1 : 0,
      total: tickSymbolCount > 0 ? 1 : 0,
      errorBudget: tickSymbolCount > 0 ? (tickOk ? 1 : 0) : null,
      details:
        tickSymbolCount > 0 && tickAgeSeconds !== null
          ? `Oldest symbol tick ${tickAgeSeconds}s old across ${tickSymbolCount} symbols`
          : 'No tick data',
    },
    {
      key: 'cron_jobs',
      label: 'Cron Job Completion',
      current: cronSuccessRate,
      sloTarget: 0.995,
      window: HOUR_LABEL,
      success: cron?.done ?? 0,
      total: cron?.total ?? 0,
      errorBudget: computeErrorBudget(cronSuccessRate, 0.995),
      details: cron && cron.total > 0 ? `${cron.done}/${cron.total} completed` : 'No cron runs in window',
    },
    {
      key: 'ai_gateway',
      label: 'AI Tool Gateway',
      current: toolSuccessRate,
      sloTarget: 0.99,
      window: HOUR_LABEL,
      success: tools?.ok ?? 0,
      total: tools?.total ?? 0,
      errorBudget: computeErrorBudget(toolSuccessRate, 0.99),
      details: tools && tools.total > 0 ? `${tools.ok}/${tools.total} tools succeeded` : 'No tool calls in window',
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
      details:
        chatTurns > 0
          ? `${chatTurns} turns in window — error rate tracked via Sentry`
          : 'No chat turns in window',
    },
    ...operationalSlis,
  ];

  // ── Overall status ──────────────────────────────────────────────────────
  let overall: HealthSloResponse['overall'] = 'healthy';

  if (!dbOk) {
    overall = 'unhealthy';
  } else if (anomalies.length > 0) {
    overall = 'degraded';
  }

  return {
    ts: new Date().toISOString(),
    dbLatencyMs,
    dbOk,
    overall,
    langfuseActive,
    langfuseBaseUrl,
    slis,
    anomalies,
  };
}

// ── Query helpers (each returns null when its source table is missing) ─────
// Cron totals/completions/stuck counts are all selected-window activity.
// Analysis counts are selected-window cohorts whose current status has
// crossed the stale/running threshold.

async function queryTickAggregate(
  db: HealthSloDb,
): Promise<TickAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(DISTINCT symbol)::int AS symbol_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(ts)))::int AS oldest_age_s
      FROM live_ticks
    `);
    const rows = extractRows(result);
    const row = rows[0] as { symbol_count: number; oldest_age_s: number | null } | undefined;

    return {
      symbolCount: Number(row?.symbol_count ?? 0),
      oldestAgeSeconds: row?.oldest_age_s == null ? null : Number(row.oldest_age_s),
    };
  } catch {
    return null;
  }
}

async function queryCronAggregate(
  db: HealthSloDb,
  since: Date,
): Promise<CronAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE started_at >= ${since})::text AS total,
        COUNT(*) FILTER (WHERE status = 'done' AND started_at >= ${since})::text AS done,
        COUNT(*) FILTER (
          WHERE status = 'started'
          AND started_at >= ${since}
          AND started_at < NOW() - INTERVAL '5 minutes'
        )::text AS stuck
      FROM cron_runs
    `);
    const rows = extractRows(result);
    const row = rows[0] as { total: string; done: string; stuck: string } | undefined;

    return {
      total: Number(row?.total ?? 0),
      done: Number(row?.done ?? 0),
      stuck: Number(row?.stuck ?? 0),
    };
  } catch {
    return null;
  }
}

async function queryToolAggregate(
  db: HealthSloDb,
  since: Date,
): Promise<ToolAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE ok = true)::text AS ok
      FROM chat_tool_telemetry
      WHERE created_at >= ${since}
    `);
    const rows = extractRows(result);
    const row = rows[0] as { total: string; ok: string } | undefined;

    return {
      total: Number(row?.total ?? 0),
      ok: Number(row?.ok ?? 0),
    };
  } catch {
    return null;
  }
}

async function queryChatAggregate(
  db: HealthSloDb,
  since: Date,
): Promise<ChatAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::text AS turns
      FROM chat_telemetry
      WHERE kind IS NULL AND created_at >= ${since}
    `);
    const rows = extractRows(result);
    const row = rows[0] as { turns: string } | undefined;

    return { turns: Number(row?.turns ?? 0) };
  } catch {
    return null;
  }
}

async function queryOperationalAggregate(
  db: HealthSloDb,
  since: Date,
): Promise<OperationalAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM analysis_jobs WHERE mode = 'full' AND created_at >= ${since})::text AS full_total,
        (SELECT COUNT(*) FROM analysis_jobs WHERE mode = 'full' AND created_at >= ${since} AND status = 'complete')::text AS full_completed,
        (SELECT COUNT(*) FROM analysis_jobs WHERE mode = 'full' AND created_at >= ${since} AND status = 'failed')::text AS full_failed,
        (SELECT COUNT(*) FROM chat_telemetry WHERE kind IN ('multi_specialist_sentiment', 'multi_specialist_sentiment_failed') AND created_at >= ${since})::text AS sentiment_total,
        (SELECT COUNT(*) FROM chat_telemetry WHERE kind = 'multi_specialist_sentiment' AND created_at >= ${since})::text AS sentiment_succeeded,
        (SELECT COUNT(*) FROM persistence_outbox WHERE created_at >= ${since} AND status IN ('completed', 'dead'))::text AS outbox_terminal,
        (SELECT COUNT(*) FROM persistence_outbox WHERE created_at >= ${since} AND status = 'completed')::text AS outbox_completed,
        (SELECT COUNT(*) FROM persistence_outbox WHERE created_at >= ${since} AND status = 'dead')::text AS outbox_dead,
        (SELECT COUNT(*) FROM ai_budget_reservations WHERE created_at >= ${since} AND status IN ('reconciled', 'released'))::text AS budget_terminal,
        (SELECT COUNT(*) FROM ai_budget_reservations WHERE created_at >= ${since} AND status IN ('reconciled', 'released') AND last_error IS NOT NULL)::text AS budget_errors,
        (SELECT COUNT(*) FROM diagnostic_traces WHERE created_at >= ${since})::text AS trace_total,
        (SELECT COUNT(*) FROM diagnostic_traces WHERE created_at >= ${since} AND status = 'failed')::text AS trace_failed,
        (SELECT COUNT(*) FROM diagnostic_traces WHERE created_at >= ${since} AND COALESCE(trace, '{}'::jsonb) @? '$.steps[*] ? (@.name == "provider_fallback")')::text AS provider_fallback_traces
    `);
    const rows = extractRows(result);
    const row = rows[0] as Record<string, string> | undefined;
    if (!row) return null;
    return {
      fullTotal: Number(row.full_total ?? 0),
      fullCompleted: Number(row.full_completed ?? 0),
      fullFailed: Number(row.full_failed ?? 0),
      sentimentTotal: Number(row.sentiment_total ?? 0),
      sentimentSucceeded: Number(row.sentiment_succeeded ?? 0),
      outboxTerminal: Number(row.outbox_terminal ?? 0),
      outboxCompleted: Number(row.outbox_completed ?? 0),
      outboxDead: Number(row.outbox_dead ?? 0),
      budgetTerminal: Number(row.budget_terminal ?? 0),
      budgetErrors: Number(row.budget_errors ?? 0),
      traceTotal: Number(row.trace_total ?? 0),
      traceFailed: Number(row.trace_failed ?? 0),
      providerFallbackTraces: Number(row.provider_fallback_traces ?? 0),
    };
  } catch {
    return null;
  }
}

async function queryAnalysisAggregate(
  db: HealthSloDb,
  since: Date,
): Promise<AnalysisAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'pending'
          AND created_at >= ${since}
          AND created_at < NOW() - INTERVAL '10 minutes'
        )::text AS stale,
        COUNT(*) FILTER (
          WHERE status = 'running'
          AND created_at >= ${since}
          AND started_at < NOW() - INTERVAL '30 seconds'
        )::text AS stuck
      FROM analysis_jobs
    `);
    const rows = extractRows(result);
    const row = rows[0] as { stale: string; stuck: string } | undefined;

    return {
      stale: Number(row?.stale ?? 0),
      stuck: Number(row?.stuck ?? 0),
    };
  } catch {
    return null;
  }
}
