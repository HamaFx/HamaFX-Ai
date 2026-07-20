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

import { getToolStats } from '@hamafx/db';
import { TOOL_NAMES, type ToolName } from '@hamafx/shared';
import { cache } from 'react';

import { toolRegistry } from './tools';

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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read `tools` + recent telemetry, return one row per registered tool.
 * Tools with no recent invocations have all numeric fields at 0.
 *
 * Wrapped with React's `cache()` so multiple server components in the
 * same render (e.g. AgentCard on /settings AND /settings/agent, or
 * future tool-telemetry widgets) share a single DB query. Cache is
 * per-request; across requests the query re-runs so 24h stats stay
 * fresh. The underlying aggregation is a non-trivial
 * percentile_cont(...) over chat_tool_telemetry, so deduping it is
 * worth a wrapper.
 */
export const buildToolCatalogue = cache(
  async (disabledTools?: string[]): Promise<CatalogueEntry[]> => {
    const since = Date.now() - ONE_DAY_MS;
    const result = await getToolStats(since);

    const stats = new Map(result.map((r) => [r.tool, r]));

    return TOOL_NAMES
      .filter((name) => !disabledTools?.includes(name))
      .map((name): CatalogueEntry => {
      const plugin = toolRegistry.getPlugin(name);
      const desc = plugin?.description ?? '(no description)';
      const agg = stats.get(name);
      const invocations = agg?.invocations ?? 0;
      const failures = agg?.failures ?? 0;
      const median = Math.round(agg?.median ?? 0);
      const p95 = Math.round(agg?.p95 ?? 0);
      return {
        name: name as ToolName,
        description: desc,
        invocations24h: invocations,
        failures24h: failures,
        medianMs: median,
        p95Ms: p95,
      };
    });
  },
);
