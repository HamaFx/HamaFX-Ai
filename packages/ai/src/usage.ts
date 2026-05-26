// Usage analytics — read-side helpers for /settings/usage.
//
// We recompute everything from `chat_telemetry` on demand. Volume stays
// modest in personal mode (low single digits of turns/day), so a 30-day
// scan is well under 100 ms even cold.

import { getDb, schema } from '@hamafx/db';
import { and, desc, gte, lte, sql } from 'drizzle-orm';

export interface TelemetryRow {
  id: string;
  threadId: string | null;
  messageId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  createdAt: number;
}

/** Last N telemetry rows, newest-first. Used for the recent-turns panel. */
export async function listTelemetry(limit = 30): Promise<TelemetryRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.chatTelemetry)
    .orderBy(desc(schema.chatTelemetry.createdAt))
    .limit(limit);
  return rows.map(rowToTelemetry);
}

export interface ModelBreakdown {
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DayBucket {
  /** ISO YYYY-MM-DD (UTC). */
  date: string;
  turns: number;
  costUsd: number;
}

export interface UsageStats {
  /** Sum of estCostUsd for today (UTC). */
  todayUsd: number;
  /** Sum for last 7 calendar days incl. today. */
  sevenDayUsd: number;
  /** Sum for the full 30-day window. */
  thirtyDayUsd: number;
  /** Tokens for the same 30-day window — input + output. */
  thirtyDayInputTokens: number;
  thirtyDayOutputTokens: number;
  /** Total chat turns recorded in the window. */
  thirtyDayTurns: number;
  /** Per-model totals across the 30-day window, sorted by cost desc. */
  byModel: ModelBreakdown[];
  /** Daily totals for the last 7 days (UTC), oldest-first. Includes empty days. */
  daily7: DayBucket[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Aggregate the last 30 days of telemetry into `UsageStats`. Single SELECT,
 * client-side reduce — keeps the page snappy on cold start.
 */
export async function computeUsage(now = new Date()): Promise<UsageStats> {
  const todayStart = startOfUtcDay(now);
  const sevenStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const thirtyStart = new Date(todayStart.getTime() - 29 * DAY_MS);

  const rows = await getDb()
    .select()
    .from(schema.chatTelemetry)
    .where(
      and(
        gte(schema.chatTelemetry.createdAt, thirtyStart),
        lte(schema.chatTelemetry.createdAt, now),
      ),
    )
    .orderBy(desc(schema.chatTelemetry.createdAt));

  let todayUsd = 0;
  let sevenDayUsd = 0;
  let thirtyDayUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const turns = rows.length;
  const byModelMap = new Map<string, ModelBreakdown>();

  // Initialise 7 daily buckets so the chart renders zeros for empty days.
  const dailyMap = new Map<string, DayBucket>();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(sevenStart.getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, turns: 0, costUsd: 0 });
  }

  for (const r of rows) {
    const cost = Number(r.estCostUsd ?? 0);
    const inT = r.inputTokens ?? 0;
    const outT = r.outputTokens ?? 0;
    thirtyDayUsd += cost;
    inputTokens += inT;
    outputTokens += outT;

    const t = r.createdAt.getTime();
    if (t >= todayStart.getTime()) todayUsd += cost;
    if (t >= sevenStart.getTime()) sevenDayUsd += cost;

    // Per-model
    const m = byModelMap.get(r.model) ?? {
      model: r.model,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    m.turns += 1;
    m.inputTokens += inT;
    m.outputTokens += outT;
    m.costUsd += cost;
    byModelMap.set(r.model, m);

    // Daily bucket
    if (t >= sevenStart.getTime()) {
      const key = r.createdAt.toISOString().slice(0, 10);
      const b = dailyMap.get(key);
      if (b) {
        b.turns += 1;
        b.costUsd += cost;
      }
    }
  }

  const byModel = [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd);
  const daily7 = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    todayUsd,
    sevenDayUsd,
    thirtyDayUsd,
    thirtyDayInputTokens: inputTokens,
    thirtyDayOutputTokens: outputTokens,
    thirtyDayTurns: turns,
    byModel,
    daily7,
  };
}

function rowToTelemetry(row: typeof schema.chatTelemetry.$inferSelect): TelemetryRow {
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    model: row.model,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    toolCalls: row.toolCalls ?? 0,
    ms: row.ms ?? 0,
    estCostUsd: Number(row.estCostUsd ?? 0),
    createdAt: row.createdAt.getTime(),
  };
}

// silence unused-import lint when this file is bundled in isolation
void sql;
