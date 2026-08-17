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

/**
 * Phase E — eval drift reporting.
 *
 * Turns a flat run of eval results into per-dimension aggregates so two
 * runs (or two models, two weeks, two market regimes) can be diffed to
 * detect quality/latency/cost drift. The default dimension is analysis
 * mode (the only dimension the stream currently emits); model and provider
 * bucketing lands when the stream metadata carries the resolved model id.
 */

import type { PromptResult } from './runner';

export interface DriftBucket {
  /** Dimension value this bucket aggregates (e.g. `quick`, `full`). */
  key: string;
  /** The analysis mode for the bucket, or null when not reported. */
  mode: string | null;
  count: number;
  okCount: number;
  failRate: number;
  avgTtftMs: number | null;
  avgTotalMs: number | null;
  avgCostUsd: number | null;
  avgCitationScore: number | null;
  assertionFailures: number;
}

export interface DriftReport {
  schemaVersion: 'kestrel.eval-drift.v1';
  generatedAt: string;
  total: number;
  buckets: DriftBucket[];
}

export function computeDrift(
  results: PromptResult[],
  generatedAt: string = new Date().toISOString(),
): DriftReport {
  const groups = new Map<string, PromptResult[]>();
  for (const result of results) {
    const mode = result.agentProgress.at(-1)?.mode ?? null;
    const key = mode ?? 'unknown';
    const list = groups.get(key);
    if (list) list.push(result);
    else groups.set(key, [result]);
  }

  const buckets: DriftBucket[] = [];
  for (const [key, list] of groups) {
    const bucket = buildBucket(key, list);
    buckets.push(bucket);
  }
  buckets.sort((a, b) => a.key.localeCompare(b.key));

  return {
    schemaVersion: 'kestrel.eval-drift.v1',
    generatedAt,
    total: results.length,
    buckets,
  };
}

function buildBucket(key: string, results: PromptResult[]): DriftBucket {
  const okCount = results.filter((r) => r.ok).length;
  const mode = results[0]?.agentProgress.at(-1)?.mode ?? null;
  const ttft = mean(results.map((r) => r.ttftMs));
  const total = mean(results.map((r) => r.totalMs));
  const cost = mean(results.map((r) => r.metadata.totalCostUsd));
  const citation = mean(results.map((r) => r.citationScore));
  const assertionFailures = results.reduce(
    (sum, r) => sum + (r.assertions?.length ?? 0),
    0,
  );

  return {
    key,
    mode,
    count: results.length,
    okCount,
    failRate: results.length > 0 ? (results.length - okCount) / results.length : 0,
    avgTtftMs: ttft,
    avgTotalMs: total,
    avgCostUsd: cost,
    avgCitationScore: citation,
    assertionFailures,
  };
}

function mean(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
}
