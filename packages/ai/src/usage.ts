/**
 * Copyright 2026 Kestrel
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

// Usage analytics — read-side helpers for /settings/usage.
//
// We recompute everything from `chat_telemetry` on demand. Volume stays
// modest in personal mode (low single digits of turns/day), so a 30-day
// scan is well under 100 ms even cold.

import { schema } from '@kestrel/db';
import { KNOWN_BYOK_PROVIDERS } from '@kestrel/shared';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from './db';

export interface TelemetryRow {
  id: string;
  threadId: string | null;
  messageId: string | null;
  traceId: string | null;
  runId: string | null;
  jobId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  createdAt: number;
}

/** Last N telemetry rows, newest-first. Used for the recent-turns panel. */
export async function listTelemetry(userId: string, limit = 30): Promise<TelemetryRow[]> {
  const rows = await getDb()
    .select()
    .from(schema.chatTelemetry)
    .where(eq(schema.chatTelemetry.userId, userId))
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

export interface ProviderBreakdown {
  /**
   * Provider id derived from the model id prefix (everything before
   * the first `/`). Examples:
   *   'google-vertex/gemini-2.5-flash' -> 'google-vertex'
   *   'anthropic/claude-sonnet-4-...' -> 'anthropic'
   *   'openai/gpt-4o' -> 'openai'
   *   'gemini-2.5-flash' -> '' (no prefix, BYOK google)
   */
  provider: string;
  /** Whether this provider maps to one of our registered BYOK providers. */
  byokProviderId: string | null;
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
  /** Sum of daily spend for today (UTC). */
  todayUsd: number;
  /** Sum for last 7 calendar days including today. */
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
  /** Per-provider totals across the 30-day window, sorted by cost desc. */
  byProvider: ProviderBreakdown[];
  /** Daily totals for the last 7 days (UTC), oldest-first. */
  daily7: DayBucket[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert an AI SDK model id into the provider prefix before the first `/`.
 */
export function providerIdFromModel(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash === -1 ? '' : modelId.slice(0, slash);
}

/** Map a model prefix to a canonical BYOK provider id. */
function canonicalizeProviderId(prefix: string): string | null {
  if (prefix === '') return 'google';
  if (prefix === 'google-vertex') return 'vertex';
  if (KNOWN_BYOK_PROVIDERS.has(prefix)) return prefix;
  return null;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Aggregate the last 30 days of telemetry and authoritative daily spend. */
export async function computeUsage(
  userId: string,
  now = new Date(),
): Promise<UsageStats> {
  const todayStart = startOfUtcDay(now);
  const sevenStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const thirtyStart = new Date(todayStart.getTime() - 29 * DAY_MS);
  const thirtyStartDay = thirtyStart.toISOString().slice(0, 10);

  const [rows, spendRows] = await Promise.all([
    getDb()
      .select()
      .from(schema.chatTelemetry)
      .where(
        and(
          eq(schema.chatTelemetry.userId, userId),
          gte(schema.chatTelemetry.createdAt, thirtyStart),
          lte(schema.chatTelemetry.createdAt, now),
        ),
      )
      .orderBy(desc(schema.chatTelemetry.createdAt)),
    getDb()
      .select()
      .from(schema.dailyAiSpend)
      .where(
        and(
          eq(schema.dailyAiSpend.userId, userId),
          gte(schema.dailyAiSpend.day, thirtyStartDay),
        ),
      )
      .limit(30),
  ]);

  // daily_ai_spend is authoritative for spend totals because it includes
  // reservations and auxiliary provider calls consistently.
  let todayUsd = 0;
  let sevenDayUsd = 0;
  let thirtyDayUsd = 0;
  const todayDay = todayStart.toISOString().slice(0, 10);
  const sevenDayBoundary = sevenStart.toISOString().slice(0, 10);

  for (const spendRow of spendRows) {
    const costUsd = Number(spendRow.totalUsdCents ?? 0) / 100;
    thirtyDayUsd += costUsd;
    if (spendRow.day >= todayDay) todayUsd += costUsd;
    if (spendRow.day >= sevenDayBoundary) sevenDayUsd += costUsd;
  }

  // Turn markers and auxiliary model rows have different meanings. Keep
  // user-turn counts separate from model/provider token breakdowns.
  const turnRows = rows.filter(
    (row) => row.kind === null || row.kind === 'multi_agent_turn',
  );
  const usageRows = rows.filter(
    (row) => row.kind === null ||
      row.kind.startsWith('title_') ||
      row.kind.startsWith('plan_') ||
      row.kind.startsWith('multi_specialist_'),
  );

  let inputTokens = 0;
  let outputTokens = 0;
  const byModelMap = new Map<string, ModelBreakdown>();
  const byProviderMap = new Map<string, ProviderBreakdown>();

  const dailyMap = new Map<string, DayBucket>();
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(sevenStart.getTime() + i * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, turns: 0, costUsd: 0 });
  }

  for (const spendRow of spendRows) {
    if (spendRow.day < sevenDayBoundary) continue;
    const bucket = dailyMap.get(spendRow.day);
    if (bucket) bucket.costUsd += Number(spendRow.totalUsdCents ?? 0) / 100;
  }

  for (const row of usageRows) {
    const costUsd = Number(row.estCostUsd ?? 0);
    const input = row.inputTokens ?? 0;
    const output = row.outputTokens ?? 0;
    inputTokens += input;
    outputTokens += output;

    const model = byModelMap.get(row.model) ?? {
      model: row.model,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    model.turns += 1;
    model.inputTokens += input;
    model.outputTokens += output;
    model.costUsd += costUsd;
    byModelMap.set(row.model, model);

    const providerPrefix = providerIdFromModel(row.model);
    const byokProviderId = canonicalizeProviderId(providerPrefix);
    if (byokProviderId) {
      const provider = byProviderMap.get(byokProviderId) ?? {
        provider: providerPrefix || 'google',
        byokProviderId,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      provider.turns += 1;
      provider.inputTokens += input;
      provider.outputTokens += output;
      provider.costUsd += costUsd;
      byProviderMap.set(byokProviderId, provider);
    }
  }

  for (const row of turnRows) {
    if (row.createdAt.getTime() < sevenStart.getTime()) continue;
    const bucket = dailyMap.get(row.createdAt.toISOString().slice(0, 10));
    if (bucket) bucket.turns += 1;
  }

  return {
    todayUsd,
    sevenDayUsd,
    thirtyDayUsd,
    thirtyDayInputTokens: inputTokens,
    thirtyDayOutputTokens: outputTokens,
    thirtyDayTurns: turnRows.length,
    byModel: [...byModelMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    byProvider: [...byProviderMap.values()].sort((a, b) => b.costUsd - a.costUsd),
    daily7: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function rowToTelemetry(row: typeof schema.chatTelemetry.$inferSelect): TelemetryRow {
  return {
    id: row.id,
    threadId: row.threadId,
    messageId: row.messageId,
    traceId: row.traceId,
    runId: row.runId,
    jobId: row.jobId,
    model: row.model,
    inputTokens: row.inputTokens ?? 0,
    outputTokens: row.outputTokens ?? 0,
    toolCalls: row.toolCalls ?? 0,
    ms: row.ms ?? 0,
    estCostUsd: Number(row.estCostUsd ?? 0),
    createdAt: row.createdAt.getTime(),
  };
}
