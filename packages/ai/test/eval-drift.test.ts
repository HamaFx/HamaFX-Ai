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

import { describe, expect, it } from 'vitest';

import { computeDrift } from '../src/eval/drift';
import type { PromptResult } from '../src/eval/runner';

function result(overrides: Partial<PromptResult> & { id: string }): PromptResult {
  return {
    prompt: overrides.id,
    ttftMs: null,
    totalMs: 0,
    text: '',
    toolCalls: [],
    agentProgress: [],
    metadata: {},
    terminalStatus: null,
    ok: true,
    ...overrides,
  };
}

describe('eval drift report', () => {
  it('buckets results by analysis mode with latency/cost aggregates', () => {
    const results: PromptResult[] = [
      result({
        id: 'q1',
        agentProgress: [{ mode: 'quick', agents: [] }],
        ttftMs: 100,
        totalMs: 1000,
        metadata: { totalCostUsd: 0.01 },
        citationScore: 1,
      }),
      result({
        id: 'q2',
        agentProgress: [{ mode: 'quick', agents: [] }],
        ttftMs: 300,
        totalMs: 3000,
        metadata: { totalCostUsd: 0.03 },
        citationScore: 0.5,
      }),
      result({
        id: 'f1',
        agentProgress: [{ mode: 'full', agents: [] }],
        ttftMs: 500,
        totalMs: 5000,
        metadata: { totalCostUsd: 0.2 },
        citationScore: 0.8,
        ok: false,
      }),
    ];

    const report = computeDrift(results, '2026-08-17T00:00:00.000Z');
    expect(report.schemaVersion).toBe('kestrel.eval-drift.v1');
    expect(report.total).toBe(3);
    expect(report.buckets.map((b) => b.key)).toEqual(['full', 'quick']);

    const quick = report.buckets.find((b) => b.key === 'quick');
    expect(quick).toMatchObject({
      count: 2,
      okCount: 2,
      failRate: 0,
      avgTtftMs: 200,
      avgTotalMs: 2000,
      avgCostUsd: 0.02,
      avgCitationScore: 0.75,
    });

    const full = report.buckets.find((b) => b.key === 'full');
    expect(full).toMatchObject({ count: 1, okCount: 0, failRate: 1 });
  });

  it('groups unreported modes into the unknown bucket', () => {
    const results = [result({ id: 'a' }), result({ id: 'b' })];
    const report = computeDrift(results);
    expect(report.buckets).toHaveLength(1);
    expect(report.buckets[0]?.key).toBe('unknown');
    expect(report.buckets[0]?.count).toBe(2);
  });

  it('counts assertion failures per bucket', () => {
    const results = [
      result({
        id: 'a',
        agentProgress: [{ mode: 'quick', agents: [] }],
        assertions: [
          { kind: 'missing_tool', detail: 'compute_risk' },
          { kind: 'unsafe_output', detail: 'guaranteed profit' },
        ],
      }),
    ];
    const report = computeDrift(results);
    expect(report.buckets[0]?.assertionFailures).toBe(2);
  });
});
