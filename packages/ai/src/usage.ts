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

// Usage analytics — read-side helpers for /settings/usage.
//
// We recompute everything from `chat_telemetry` on demand. Volume stays
// modest in personal mode (low single digits of turns/day), so a 30-day
// scan is well under 100 ms even cold.

import { cache } from 'react';
import { getDb, schema } from '@hamafx/db';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

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
   *   'anthropic/claude-sonnet-4-...`  -> 'anthropic'
   *   'openai/gpt-4o'                   -> 'openai'
   *   'gemini-2.5-flash'               -> '' (no prefix, BYOK google)
   */
  provider: string;
  /** Whether this provider maps to one of our 9 BYOK providers. */
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
  /** Per-provider totals across the 30-day window, sorted by cost desc. */
  byProvider: ProviderBreakdown[];
  /** Daily totals for the last 7 days (UTC), oldest-first. Includes empty days. */
  daily7: DayBucket[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Phase D — api-keys page overhaul.
 *
 * Convert an AI SDK model id like `google-vertex/gemini-2.5-flash`
 * into a provider id (the segment before the first `/`) and then
 * map it back to one of our 9 known BYOK providers.
 *
 * Why the mapping matters: the agent persists the literal model id
 * it streams with (including the gateway/vertex prefix), but the
 * api-keys page groups usage by BYOK provider id. Without this map
 * we'd get "google-vertex" / "openai" / "anthropic" / "" all
 * appearing as separate providers in the breakdown even though
 * the user only configured 2 BYOK keys.
 */
export function providerIdFromModel(modelId: string): string {
  const slash = modelId.indexOf('/');
  if (slash === -1) return '';
  return modelId.slice(0, slash);
}

const KNOWN_BYOK_PROVIDERS = new Set([
  'google',
  'vertex',
  'anthropic',
  'openai',
  'groq',
  'mistral',
  'openrouter',
  'xai',
  'deepseek',
]);

/**
 * Map a raw provider prefix (from a model id) to a canonical BYOK
 * id. `google-vertex` -> `vertex` (Vertex AI). Empty string (no
 * prefix) -> `google` (BYOK google uses bare model ids).
 */
function canonicalizeProviderId(prefix: string): string | null {
  if (prefix === '') return 'google';
  if (prefix === 'google-vertex') return 'vertex';
  if (KNOWN_BYOK_PROVIDERS.has(prefix)) return prefix;
  return null;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Aggregate the last 30 days of telemetry into `UsageStats`. Single SELECT,
 * client-side reduce — keeps the page snappy on cold start.
 */
export const computeUsage = cache(
  async (userId: string, now = new Date()): Promise<UsageStats> => {
  const todayStart = startOfUtcDay(now);
  const sevenStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const thirtyStart = new Date(todayStart.getTime() - 29 * DAY_MS);

  const rows = await getDb()
    .select()
    .from(schema.chatTelemetry)
    .where(
      and(
        eq(schema.chatTelemetry.userId, userId),
        gte(schema.chatTelemetry.createdAt, thirtyStart),
        lte(schema.chatTelemetry.createdAt, now),
      ),
    )
    .orderBy(desc(schema.chatTelemetry.createdAt));

  // Routing breadcrumbs (Phase 7a) carry zero tokens / zero cost — they're
  // useful for breakdowns but must not inflate "turns" counts. We exclude
  // them from the rollup.
  const turnRows = rows.filter(
    (r) => r.kind === null || (!r.kind.startsWith('routing_') && !r.kind.startsWith('plan_')),
  );

  let todayUsd = 0;
  let sevenDayUsd = 0;
  let thirtyDayUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const turns = turnRows.length;
  const byModelMap = new Map<string, ModelBreakdown>();
  // Phase D — per-provider aggregation. Keyed by the canonical
  // BYOK id (e.g. 'vertex' for the 'google-vertex/' model prefix).
  const byProviderMap = new Map<string, ProviderBreakdown>();

  // Initialise 7 daily buckets so the chart renders zeros for empty days.
  const dailyMap = new Map<string, DayBucket>();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(sevenStart.getTime() + i * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, turns: 0, costUsd: 0 });
  }

  for (const r of turnRows) {
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

    // Per-provider (canonicalised).
    const rawPrefix = providerIdFromModel(r.model);
    const byokId = canonicalizeProviderId(rawPrefix);
    if (byokId) {
      const p = byProviderMap.get(byokId) ?? {
        provider: rawPrefix || 'google',
        byokProviderId: byokId,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      p.turns += 1;
      p.inputTokens += inT;
      p.outputTokens += outT;
      p.costUsd += cost;
      byProviderMap.set(byokId, p);
    }

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
  const byProvider = [...byProviderMap.values()].sort((a, b) => b.costUsd - a.costUsd);
  const daily7 = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    todayUsd,
    sevenDayUsd,
    thirtyDayUsd,
    thirtyDayInputTokens: inputTokens,
    thirtyDayOutputTokens: outputTokens,
    thirtyDayTurns: turns,
    byModel,
    byProvider,
    daily7,
  };
});

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
