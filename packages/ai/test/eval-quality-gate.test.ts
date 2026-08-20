/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
  evaluateEvalQualityGate,
  thresholdsFromEnv,
} from '../src/eval/quality-gate';
import type { PromptResult } from '../src/eval/runner';

function result(overrides: Partial<PromptResult> & { id: string }): PromptResult {
  return {
    prompt: overrides.id,
    ttftMs: 100,
    totalMs: 1000,
    text: 'Grounded response.',
    toolCalls: [],
    agentProgress: [],
    metadata: { totalCostUsd: 0.01 },
    terminalStatus: 'complete',
    ok: true,
    citationScore: 1,
    assertions: [],
    ...overrides,
  };
}

describe('evaluation quality gate', () => {
  it('passes a clean result within all configured limits', () => {
    const gate = evaluateEvalQualityGate([result({ id: 'clean' })]);

    expect(gate).toMatchObject({
      schemaVersion: 'kestrel.eval-gate.v1',
      passed: true,
      failures: [],
      observed: {
        caseCount: 1,
        successfulCaseCount: 1,
        transportPassRate: 1,
        overallPassRate: 1,
        assertionPassRate: 1,
        averageCitationScore: 1,
        averageTtftMs: 100,
        averageTotalMs: 1000,
        averageCostUsd: 0.01,
      },
    });
  });

  it('fails transport, safety/grounding, latency, and cost regressions together', () => {
    const gate = evaluateEvalQualityGate(
      [
        result({
          id: 'unsafe',
          ok: false,
          citationScore: null,
          ttftMs: null,
          totalMs: 5000,
          metadata: { totalCostUsd: 1 },
          assertions: [{ kind: 'unsafe_output', detail: 'guaranteed profit' }],
        }),
        result({
          id: 'ungrounded',
          citationScore: 0.25,
          ttftMs: 3000,
          totalMs: 5000,
          metadata: { totalCostUsd: 1 },
          assertions: [{ kind: 'unsupported_numeric_claim', detail: 'missing tool support' }],
        }),
      ],
      {
        minCaseCount: 1,
        minSuccessfulCaseCount: 1,
        minTransportPassRate: 1,
        minOverallPassRate: 1,
        minAssertionPassRate: 1,
        minCitationScore: 0.9,
        maxAverageTtftMs: 1000,
        maxAverageTotalMs: 2000,
        maxAverageCostUsd: 0.1,
      },
    );

    expect(gate.passed).toBe(false);
    expect(gate.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('transport pass rate'),
      expect.stringContaining('overall pass rate'),
      expect.stringContaining('assertion pass rate'),
      expect.stringContaining('average citation score'),
      expect.stringContaining('average TTFT'),
      expect.stringContaining('average total latency'),
      expect.stringContaining('average cost'),
    ]));
  });

  it('fails an empty run instead of treating missing evidence as success', () => {
    const gate = evaluateEvalQualityGate([]);
    expect(gate.passed).toBe(false);
    expect(gate.failures).toContain('no evaluation cases were executed');
    expect(gate.failures).toContain('case count 0 is below 1');
    expect(gate.failures).toContain('successful case count 0 is below 1');
  });

  it('fails a run that is too small to be a release-quality sample', () => {
    const gate = evaluateEvalQualityGate(
      [result({ id: 'one' })],
      { ...DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS, minCaseCount: 5, minSuccessfulCaseCount: 3 },
    );
    expect(gate.passed).toBe(false);
    expect(gate.failures).toEqual(expect.arrayContaining([
      'case count 1 is below 5',
      'successful case count 1 is below 3',
    ]));
  });

  it('reads bounded thresholds from environment values', () => {
    expect(thresholdsFromEnv({
      EVAL_MIN_CASES: '20',
      EVAL_MIN_SUCCESSFUL_CASES: '18',
      EVAL_MIN_TRANSPORT_PASS_RATE: '0.99',
      EVAL_MIN_OVERALL_PASS_RATE: '0.8',
      EVAL_MIN_ASSERTION_PASS_RATE: '0.85',
      EVAL_MIN_CITATION_SCORE: '0.75',
      EVAL_MAX_AVG_TTFT_MS: '1500',
      EVAL_MAX_AVG_TOTAL_MS: 'disabled',
      EVAL_MAX_AVG_COST_USD: '0.2',
    })).toEqual({
      minCaseCount: 20,
      minSuccessfulCaseCount: 18,
      minTransportPassRate: 0.99,
      minOverallPassRate: 0.8,
      minAssertionPassRate: 0.85,
      minCitationScore: 0.75,
      maxAverageTtftMs: 1500,
      maxAverageTotalMs: null,
      maxAverageCostUsd: 0.2,
    });
  });
});
