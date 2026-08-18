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

import { beforeEach, describe, expect, it } from 'vitest';

import { metrics } from '@kestrel/shared';

import { emitEvalMetrics, isEvalCaseOk } from '../src/eval/eval-metrics';
import type { PromptResult } from '../src/eval/runner';

function makeResult(ok: boolean, assertionCount = 0): PromptResult {
  return {
    id: `case-${ok}-${assertionCount}`,
    prompt: 'p',
    text: 't',
    ttftMs: 1,
    totalMs: 2,
    toolCalls: [],
    agentProgress: [],
    metadata: {},
    terminalStatus: ok ? 'complete' : null,
    ok,
    assertions: assertionCount > 0
      ? Array.from({ length: assertionCount }, () => ({ kind: 'missing_tool' as const, detail: 'x' }))
      : [],
  };
}

beforeEach(() => {
  metrics.reset();
});

describe('isEvalCaseOk', () => {
  it('is true only when transport succeeded and no assertions failed', () => {
    expect(isEvalCaseOk(makeResult(true, 0))).toBe(true);
    expect(isEvalCaseOk(makeResult(true, 1))).toBe(false);
    expect(isEvalCaseOk(makeResult(false, 0))).toBe(false);
    expect(isEvalCaseOk(makeResult(false, 2))).toBe(false);
  });
});

describe('emitEvalMetrics', () => {
  it('emits one tagged counter per case', () => {
    emitEvalMetrics([makeResult(true, 0), makeResult(true, 1), makeResult(false, 0)]);

    const snapshot = metrics.snapshot();
    expect(snapshot.counters['eval_case_total{result=ok}']).toBe(1);
    expect(snapshot.counters['eval_case_total{result=fail}']).toBe(2);
  });

  it('emits nothing for an empty run', () => {
    emitEvalMetrics([]);
    expect(metrics.snapshot().counters).toEqual({});
  });
});
