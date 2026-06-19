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

// Phase 7c — auto-generated tool catalogue.
//
// Reads `tools` from the registry and projects a small, JSON-friendly
// shape that the /settings/agent page can render. Per-tool latency is
// summarised over the last 24h via `chat_tool_telemetry`. Failure rate is
// the same window. Schema-driven: adding a tool to `tools/index.ts` makes
// it appear here automatically; no hand-maintained list to drift.

import { getDb, schema } from '@hamafx/db';
import { TOOL_NAMES, type ToolName } from '@hamafx/shared';
import { gte, sql } from 'drizzle-orm';

import { tools } from './tools';

export interface CatalogueEntry {
  name: ToolName;
  description: string;
  invocations24h: number;
  failures24h: number;
  /** ms median latency over the last 24 h. 0 when no samples. */
  medianMs: number;
  /** ms p95 latency over the last 24 h. 0 when no samples. */
  p95Ms: number;
}

interface RawAgg {
  tool: string | null;
  invocations: string | number | null;
  failures: string | number | null;
  median: string | number | null;
  p95: string | number | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read `tools` + recent telemetry, return one row per registered tool.
 * Tools with no recent invocations have all numeric fields at 0.
 */
export async function buildToolCatalogue(): Promise<CatalogueEntry[]> {
  const since = new Date(Date.now() - ONE_DAY_MS);
  const result = await getDb()
    .select({
      tool: schema.chatToolTelemetry.tool,
      invocations: sql<number>`count(*)`.as('invocations'),
      failures: sql<number>`sum(case when ${schema.chatToolTelemetry.ok} = false then 1 else 0 end)`.as(
        'failures',
      ),
      median: sql<number>`percentile_cont(0.5) within group (order by ${schema.chatToolTelemetry.ms})`.as(
        'median',
      ),
      p95: sql<number>`percentile_cont(0.95) within group (order by ${schema.chatToolTelemetry.ms})`.as(
        'p95',
      ),
    })
    .from(schema.chatToolTelemetry)
    .where(gte(schema.chatToolTelemetry.createdAt, since))
    .groupBy(schema.chatToolTelemetry.tool);

  const stats = new Map<string, RawAgg>();
  for (const r of result) stats.set(r.tool, r as unknown as RawAgg);

  return TOOL_NAMES.map((name): CatalogueEntry => {
    const tool = tools[name as keyof typeof tools] as { description?: string } | undefined;
    const desc = tool?.description ?? '(no description)';
    const agg = stats.get(name);
    const invocations = Number(agg?.invocations ?? 0);
    const failures = Number(agg?.failures ?? 0);
    const median = Math.round(Number(agg?.median ?? 0));
    const p95 = Math.round(Number(agg?.p95 ?? 0));
    return {
      name: name as ToolName,
      description: desc,
      invocations24h: invocations,
      failures24h: failures,
      medianMs: median,
      p95Ms: p95,
    };
  });
}
