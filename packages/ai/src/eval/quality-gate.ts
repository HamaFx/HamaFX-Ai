/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import type { PromptResult } from './runner';
import { isEvalCaseOk } from './eval-metrics';

export interface EvalQualityGateThresholds {
  /** Minimum number of executed cases; prevents empty/small runs becoming release evidence. */
  minCaseCount: number;
  /** Minimum successfully transported cases required by the release gate. */
  minSuccessfulCaseCount: number;
  minTransportPassRate: number;
  minOverallPassRate: number;
  minAssertionPassRate: number;
  minCitationScore: number;
  maxAverageTtftMs: number | null;
  maxAverageTotalMs: number | null;
  maxAverageCostUsd: number | null;
}

export interface EvalQualityGateObserved {
  caseCount: number;
  successfulCaseCount: number;
  transportPassRate: number;
  overallPassRate: number;
  assertionPassRate: number;
  averageCitationScore: number | null;
  averageTtftMs: number | null;
  averageTotalMs: number | null;
  averageCostUsd: number | null;
}

export interface EvalQualityGateResult {
  schemaVersion: 'kestrel.eval-gate.v1';
  passed: boolean;
  failures: string[];
  thresholds: EvalQualityGateThresholds;
  observed: EvalQualityGateObserved;
}

export const DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS: EvalQualityGateThresholds = {
  minCaseCount: 1,
  minSuccessfulCaseCount: 1,
  minTransportPassRate: 1,
  minOverallPassRate: 0.95,
  minAssertionPassRate: 0.95,
  minCitationScore: 0.9,
  maxAverageTtftMs: 30_000,
  maxAverageTotalMs: 120_000,
  maxAverageCostUsd: 0.5,
};

export function evaluateEvalQualityGate(
  results: readonly PromptResult[],
  thresholds: EvalQualityGateThresholds = DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
): EvalQualityGateResult {
  const total = results.length;
  const successfulCaseCount = results.filter((result) => result.ok).length;
  const transportPassRate = rate(results, (result) => result.ok);
  const overallPassRate = rate(results, isEvalCaseOk);
  const assertionPassRate = rate(results, (result) => result.ok && (result.assertions?.length ?? 0) === 0);
  const observed: EvalQualityGateObserved = {
    caseCount: total,
    successfulCaseCount,
    transportPassRate,
    overallPassRate,
    assertionPassRate,
    averageCitationScore: mean(results.map((result) => result.citationScore)),
    averageTtftMs: mean(results.map((result) => result.ttftMs)),
    averageTotalMs: mean(results.map((result) => result.totalMs)),
    averageCostUsd: mean(results.map((result) => result.metadata.totalCostUsd)),
  };

  const failures: string[] = [];
  if (total < thresholds.minCaseCount) {
    failures.push(`case count ${total} is below ${thresholds.minCaseCount}`);
  }
  if (successfulCaseCount < thresholds.minSuccessfulCaseCount) {
    failures.push(`successful case count ${successfulCaseCount} is below ${thresholds.minSuccessfulCaseCount}`);
  }
  if (total === 0) failures.push('no evaluation cases were executed');
  if (observed.transportPassRate < thresholds.minTransportPassRate) {
    failures.push(`transport pass rate ${formatRate(observed.transportPassRate)} is below ${formatRate(thresholds.minTransportPassRate)}`);
  }
  if (observed.overallPassRate < thresholds.minOverallPassRate) {
    failures.push(`overall pass rate ${formatRate(observed.overallPassRate)} is below ${formatRate(thresholds.minOverallPassRate)}`);
  }
  if (observed.assertionPassRate < thresholds.minAssertionPassRate) {
    failures.push(`assertion pass rate ${formatRate(observed.assertionPassRate)} is below ${formatRate(thresholds.minAssertionPassRate)}`);
  }
  if (observed.averageCitationScore !== null && observed.averageCitationScore < thresholds.minCitationScore) {
    failures.push(`average citation score ${formatRate(observed.averageCitationScore)} is below ${formatRate(thresholds.minCitationScore)}`);
  }
  addMaximumFailure(failures, 'average TTFT', observed.averageTtftMs, thresholds.maxAverageTtftMs, 'ms');
  addMaximumFailure(failures, 'average total latency', observed.averageTotalMs, thresholds.maxAverageTotalMs, 'ms');
  addMaximumFailure(failures, 'average cost', observed.averageCostUsd, thresholds.maxAverageCostUsd, 'USD');

  return {
    schemaVersion: 'kestrel.eval-gate.v1',
    passed: failures.length === 0,
    failures,
    thresholds,
    observed,
  };
}

export function thresholdsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EvalQualityGateThresholds {
  return {
    minCaseCount: readInteger(env.EVAL_MIN_CASES, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.minCaseCount),
    minSuccessfulCaseCount: readInteger(env.EVAL_MIN_SUCCESSFUL_CASES, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.minSuccessfulCaseCount),
    minTransportPassRate: readRate(env.EVAL_MIN_TRANSPORT_PASS_RATE, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.minTransportPassRate),
    minOverallPassRate: readRate(env.EVAL_MIN_OVERALL_PASS_RATE, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.minOverallPassRate),
    minAssertionPassRate: readRate(env.EVAL_MIN_ASSERTION_PASS_RATE, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.minAssertionPassRate),
    minCitationScore: readRate(env.EVAL_MIN_CITATION_SCORE, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.minCitationScore),
    maxAverageTtftMs: readMaximum(env.EVAL_MAX_AVG_TTFT_MS, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.maxAverageTtftMs),
    maxAverageTotalMs: readMaximum(env.EVAL_MAX_AVG_TOTAL_MS, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.maxAverageTotalMs),
    maxAverageCostUsd: readMaximum(env.EVAL_MAX_AVG_COST_USD, DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS.maxAverageCostUsd),
  };
}

function rate(results: readonly PromptResult[], predicate: (result: PromptResult) => boolean): number {
  if (results.length === 0) return 0;
  return results.filter(predicate).length / results.length;
}

function mean(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function readRate(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`invalid evaluation rate threshold: ${value}`);
  return parsed;
}

function readInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid evaluation integer threshold: ${value}`);
  return parsed;
}

function readMaximum(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  if (value.trim().toLowerCase() === 'disabled') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`invalid evaluation maximum threshold: ${value}`);
  return parsed;
}

function addMaximumFailure(
  failures: string[],
  label: string,
  observed: number | null,
  maximum: number | null,
  unit: string,
): void {
  if (maximum === null || observed === null || observed <= maximum) return;
  failures.push(`${label} ${observed.toFixed(2)} ${unit} exceeds ${maximum.toFixed(2)} ${unit}`);
}

function formatRate(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
