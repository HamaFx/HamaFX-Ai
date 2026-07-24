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
  newestAgeSeconds: number | null;
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

const ONE_SECOND = 1000;
const ONE_MINUTE = 60 * ONE_SECOND;

function pct(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function computeErrorBudget(current: number | null, sloTarget: number): number | null {
  if (current === null) return null;
  if (current >= 1) return 1;
  if (sloTarget >= 1) return current >= 1 ? 1 : 0;
  return pct((current - sloTarget) / (1 - sloTarget));
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
  const [ticksResult, cronResult, toolResult, chatResult, analysisResult] = await Promise.allSettled([
    queryTickAggregate(db),
    queryCronAggregate(db, since),
    queryToolAggregate(db, since),
    queryChatAggregate(db, since),
    queryAnalysisAggregate(db),
  ]);

  const ticks = ticksResult.status === 'fulfilled' ? ticksResult.value : null;
  const cron = cronResult.status === 'fulfilled' ? cronResult.value : null;
  const tools = toolResult.status === 'fulfilled' ? toolResult.value : null;
  const chat = chatResult.status === 'fulfilled' ? chatResult.value : null;
  const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null;

  const anomalies: string[] = [];

  // ── Build tick SLI / anomaly ────────────────────────────────────────────
  const TICK_FRESH_S = 60;
  const TICK_OK_S = 300;
  let tickOk = false;
  let tickAgeSeconds: number | null = null;
  let tickSymbolCount = 0;

  if (ticks) {
    tickSymbolCount = ticks.symbolCount;
    tickAgeSeconds = ticks.newestAgeSeconds;
    if (tickAgeSeconds !== null) {
      tickOk = tickAgeSeconds <= TICK_OK_S;
      if (tickAgeSeconds > TICK_FRESH_S) {
        anomalies.push(
          `Tick data is stale: newest tick is ${tickAgeSeconds}s old (threshold: ${TICK_FRESH_S}s)`,
        );
      }
    } else {
      anomalies.push('No live tick data — worker may not be running');
    }
  }

  // ── Build cron SLI / anomaly ──────────────────────────────────────────────
  let cronSuccessRate: number | null = null;
  if (cron) {
    if (cron.total > 0) {
      cronSuccessRate = cron.done / cron.total;
    }
    if (cron.stuck > 0) {
      anomalies.push(`${cron.stuck} cron job(s) stuck in 'started' > 5 minutes`);
    }
  }

  // ── Build AI gateway SLI ────────────────────────────────────────────────
  let toolSuccessRate: number | null = null;
  if (tools && tools.total > 0) {
    toolSuccessRate = tools.ok / tools.total;
  }

  // ── Build chat API count ────────────────────────────────────────────────
  const chatTurns = chat?.turns ?? 0;

  // ── Build analysis anomalies ────────────────────────────────────────────
  if (analysis) {
    if (analysis.stale > 0) {
      anomalies.push(`${analysis.stale} analysis job(s) pending > 10 minutes — worker may be down`);
    }
    if (analysis.stuck > 0) {
      anomalies.push(`${analysis.stuck} analysis job(s) stuck in 'running' > 30 seconds`);
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

  const slis: SliSnapshot[] = [
    {
      key: 'worker_ticks',
      label: 'Worker / Tick Freshness',
      current: tickSymbolCount > 0 ? (tickOk ? 1 : 0) : null,
      sloTarget: 0.999,
      window: HOUR_LABEL,
      success: tickOk ? 1 : 0,
      total: tickSymbolCount > 0 ? 1 : 0,
      errorBudget: tickSymbolCount > 0 ? (tickOk ? 1 : 0) : null,
      details:
        tickSymbolCount > 0 && tickAgeSeconds !== null
          ? `Newest tick ${tickAgeSeconds}s old across ${tickSymbolCount} symbols`
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

async function queryTickAggregate(
  db: HealthSloDb,
): Promise<TickAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(DISTINCT symbol)::int AS symbol_count,
        EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::int AS newest_age_s
      FROM live_ticks
    `);
    const rows = extractRows(result);
    const row = rows[0] as { symbol_count: number; newest_age_s: number | null } | undefined;

    return {
      symbolCount: Number(row?.symbol_count ?? 0),
      newestAgeSeconds: row?.newest_age_s ?? null,
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
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'done')::text AS done,
        COUNT(*) FILTER (
          WHERE status = 'started'
          AND started_at < NOW() - INTERVAL '5 minutes'
        )::text AS stuck
      FROM cron_runs
      WHERE started_at >= ${since}
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

async function queryAnalysisAggregate(
  db: HealthSloDb,
): Promise<AnalysisAggregate | null> {
  try {
    const result = await db.execute(sql`
      SELECT
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
