// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 6 evals — quality gate over score records.
 *
 * The existing `EvalQualityGate` (from `src/eval/quality-gate.ts`) validates
 * transport/assertion/citation/latency/cost metrics of a full eval run. This
 * module adapts it into a Mastra-native gate that consumes the `scores`
 * storage domain: given the score rows recorded for a run (or an experiment
 * batch), it produces the same `passed/failures/thresholds/observed` envelope
 * so CI and release tooling can consume one gate contract regardless of the
 * run's origin (legacy eval runner or Mastra experiment).
 */

import type { MastraScorer } from '@mastra/core/evals';
import { createScorer } from '@mastra/core/evals';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import {
  DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
  evaluateEvalQualityGate,
  type EvalQualityGateResult,
  type EvalQualityGateThresholds,
} from '../../eval/quality-gate';
import type { ScoreRecord } from './scores';

const glog = createCategorizedLogger('ai', { component: 'mastra-evals-gate' });

export interface MastraGateScoreInput {
  /** Score rows recorded for the run/batch being gated. */
  records: ScoreRecord[];
  /** Optional thresholds; defaults to the canonical eval gate thresholds. */
  thresholds?: EvalQualityGateThresholds;
  /** Expected minimum number of scored records. */
  minScoreCount?: number;
}

/**
 * Translate Mastra score records into the canonical eval-gate observed shape.
 *
 * Mapping:
 * - `caseCount`   ← number of score records (scorer runs)
 * - `successfulCaseCount` ← records with `score >= 0.5` (or `score === 1` for
 *   the boolean grounding scorer)
 * - `overallPassRate` ← share of records meeting their scorer threshold
 * - `averageCitationScore` ← mean of `kestrel-citation` scores
 * - latency/cost are not part of the score domain; they stay `null` unless
 *   the caller enriches records with `metadata.ttftMs`/`totalMs`/`costUsd`.
 */
/**
 * Scorers where a LOW score is good (hallucination, bias, toxicity).
 * Anything else is treated as high-is-good.
 */
const INVERTED_SCORERS = new Set(['hallucination', 'bias', 'toxicity']);

/** A hallucination/bias/toxicity score at or below this is a pass. */
const INVERTED_PASS_CEILING = 0.2;

export function recordsToGateObserved(
  records: readonly ScoreRecord[],
  thresholds: EvalQualityGateThresholds = DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
): EvalQualityGateResult {
  const total = records.length;
  const pass = (record: ScoreRecord): boolean => {
    // Grounding is a strict boolean; citation uses the citation minimum;
    // inverted scorers (hallucination/bias/toxicity) pass when low;
    // everything else passes at/above the overall pass rate.
    if (record.scorerId === 'kestrel-grounding') return record.score === 1;
    if (record.scorerId === 'kestrel-citation') return record.score >= thresholds.minCitationScore;
    if (INVERTED_SCORERS.has(record.scorerId)) return record.score <= INVERTED_PASS_CEILING;
    return record.score >= thresholds.minOverallPassRate;
  };
  const successfulCaseCount = records.filter(pass).length;
  const citationScores = records
    .filter((record) => record.scorerId === 'kestrel-citation')
    .map((record) => record.score);

  // Merge partial caller thresholds over the canonical defaults so every
  // maximum field is present (the legacy gate crashes on `undefined` maxes).
  const effectiveThresholds: EvalQualityGateThresholds = {
    ...DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
    ...thresholds,
  };

  return evaluateEvalQualityGate(
    records.map((record) => ({
      id: record.runId,
      prompt: '',
      ttftMs: record.metadata?.ttftMs ?? null,
      totalMs: record.metadata?.totalMs ?? 0,
      text: '',
      toolCalls: [],
      ok: pass(record),
      metadata: {
        totalCostUsd: record.metadata?.costUsd ?? 0,
      },
      citationScore: record.scorerId === 'kestrel-citation' ? record.score : null,
      assertions:
        record.scorerId === 'kestrel-grounding' && record.score < 1
          ? [{ kind: 'unsupported_numeric_claim', detail: record.reason ?? 'report failed grounding' }]
          : [],
      // Gate-only projection: agent progress and terminal status are not part
      // of the score domain; the runner's `ok` is derived from scorer pass.
      agentProgress: [],
      terminalStatus: null,
    })),
    {
      ...effectiveThresholds,
      minCaseCount: Math.max(effectiveThresholds.minCaseCount, 1),
      // Override the runner-specific citation minimum with the mean of the
      // citation records (allows the gate to run with only score records).
      ...(citationScores.length > 0 ? { minCitationScore: effectiveThresholds.minCitationScore } : {}),
    },
  );
}

/**
 * Mastra gate scorer — attach to a `runEvals` config's `gates` or use
 * directly with the score records persisted for a run. Returns 1 when the
 * batch meets the configured thresholds, 0 otherwise, with a human-readable
 * reason listing failures.
 */
export function createMastraEvalGate(
  options: MastraGateScoreInput = { records: [] },
): MastraScorer<string, any, any, Record<'preprocessStepResult', { passed: boolean; failures: string[] }>> {
  return createScorer({
    id: 'kestrel-eval-gate',
    name: 'Kestrel Eval Quality Gate',
    description:
      'Scores 1 when the recorded eval scores meet the Kestrel quality thresholds (pass rates, citation score, latency/cost ceilings).',
    type: 'agent',
  })
    .preprocess(async ({ run }) => {
      const input = (run.input ?? {}) as MastraGateScoreInput;
      const records = input.records ?? [];
      if (records.length === 0) {
        glog.warn('Eval gate ran with no score records; failing', { runId: run.runId });
        return {
          passed: false,
          failures: ['no score records were provided to the eval gate'],
        };
      }
      const result = recordsToGateObserved(records, input.thresholds);
      return { passed: result.passed, failures: result.failures };
    })
    .generateScore(({ results }) => {
      const step = results.preprocessStepResult;
      if (!step) return 0;
      if (!step.passed) {
        glog.warn('Eval gate failed', { failures: step.failures.slice(0, 5) });
      }
      return step.passed ? 1 : 0;
    });
}

/**
 * Deterministic scorer that wraps a single score-record predicate — used to
 * gate a specific scorer's minimum (e.g. "hallucination must be ≤ 0.1").
 */
export function createScoreThresholdGate(
  scorerId: string,
  options: { min?: number; max?: number; description?: string } = {},
): MastraScorer<string, any, any, Record<'preprocessStepResult', { passed: boolean; score: number }>> {
  const { min = 0.5, max = null, description } = options;
  return createScorer({
    id: `kestrel-gate-${scorerId}`,
    name: `Gate: ${scorerId}`,
    description:
      description ??
      `Scores 1 when the '${scorerId}' score meets the configured ${max === null ? `minimum ${min}` : `range [${min}, ${max}]`}.`,
    type: 'agent',
  })
    .preprocess(async ({ run }) => {
      const records = ((run.input as { records?: ScoreRecord[] } | undefined)?.records ?? []) as ScoreRecord[];
      const record = records.find((candidate) => candidate.scorerId === scorerId);
      if (!record) return { passed: false, score: 0 };
      const passed = record.score >= min && (max === null || record.score <= max);
      return { passed, score: record.score };
    })
    .generateScore(({ results }) => {
      return results.preprocessStepResult?.passed ? 1 : 0;
    });
}
