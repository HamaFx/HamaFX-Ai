// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 6 evals — datasets & experiments.
 *
 * Migrates the three legacy eval case files into Mastra datasets
 * (`mastra.datasets`), then runs A/B experiments with `runEvals`:
 *
 * - `cases.json`         → dataset `kestrel-eval-cases`   (acceptance)
 * - `prompts.json`       → dataset `kestrel-eval-prompts` (chat transport)
 * - `regression-cases.json` → dataset `kestrel-eval-regression` (regressions)
 *
 * Every case keeps its source file id as `externalId` so a score record can
 * be traced back to the originating case. `runEvals` scores each item with
 * the configured scorers + gates and persists results into the `scores`
 * domain — the same domain the live sampled scoring writes to, so the gate
 * and training export consume one record stream.
 */

import type { Mastra } from '@mastra/core';
import type { MastraScorer } from '@mastra/core/evals';
import { runEvals } from '@mastra/core/evals';
import { createCategorizedLogger } from '@kestrel/shared/logger';
import { z } from 'zod';

import casesJson from '../../eval/cases.json';
import promptsJson from '../../eval/prompts.json';
import regressionCasesJson from '../../eval/regression-cases.json';

const dlog = createCategorizedLogger('ai', { component: 'mastra-evals-datasets' });

export const DATASET_IDS = {
  cases: 'kestrel-eval-cases',
  prompts: 'kestrel-eval-prompts',
  regression: 'kestrel-eval-regression',
} as const;

export type EvalDatasetId = (typeof DATASET_IDS)[keyof typeof DATASET_IDS];

/** Source shape shared by all three legacy case files. */
const EvalCaseInputSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedTools: z.array(z.string()).optional(),
  forbiddenTools: z.array(z.string()).optional(),
  mustContainSubstrings: z.array(z.string()).optional(),
  quality: z
    .object({
      requireNumericToolSupport: z.boolean().optional(),
      requireEventToolSupport: z.boolean().optional(),
      forbiddenOutputSubstrings: z.array(z.string()).optional(),
      requiredOutputSubstrings: z.array(z.string()).optional(),
      maxTtftMs: z.number().optional(),
      maxTotalMs: z.number().optional(),
      maxCostUsd: z.number().optional(),
    })
    .optional(),
  analysisMode: z.string().optional(),
  expectedAgents: z.array(z.string()).optional(),
  expectedAgentStatuses: z.record(z.string()).optional(),
  expectedTerminalStatus: z.string().optional(),
  expectedToolOutputs: z.array(z.unknown()).optional(),
});

type EvalCaseInput = z.infer<typeof EvalCaseInputSchema>;

const CASES_BY_DATASET: Record<EvalDatasetId, unknown[]> = {
  [DATASET_IDS.cases]: casesJson as unknown[],
  [DATASET_IDS.prompts]: promptsJson as unknown[],
  [DATASET_IDS.regression]: regressionCasesJson as unknown[],
};

/** Human-readable label per dataset id. */
export const DATASET_LABELS: Record<EvalDatasetId, string> = {
  [DATASET_IDS.cases]: 'Kestrel acceptance cases',
  [DATASET_IDS.prompts]: 'Kestrel chat transport prompts',
  [DATASET_IDS.regression]: 'Kestrel regression cases',
};

/**
 * Parse and validate every legacy case, returning the validated inputs keyed
 * by their original case id. Invalid entries are skipped with a warning so a
 * single malformed case never blocks the whole migration.
 */
export function loadLegacyEvalCases(datasetId: EvalDatasetId): EvalCaseInput[] {
  const raw = CASES_BY_DATASET[datasetId];
  const parsed: EvalCaseInput[] = [];
  for (const entry of raw) {
    const result = EvalCaseInputSchema.safeParse(entry);
    if (!result.success) {
      dlog.warn('Skipping malformed eval case during dataset migration', {
        datasetId,
        error: result.error.message,
      });
      continue;
    }
    parsed.push(result.data);
  }
  return parsed;
}

export interface MigrateDatasetsOptions {
  /** Skip datasets that already exist (default: true — idempotent re-runs). */
  skipExisting?: boolean;
}

export interface DatasetMigrationSummary {
  created: Array<{ id: EvalDatasetId; itemCount: number }>;
  skipped: EvalDatasetId[];
}

/**
 * Create the three eval datasets and insert their items (idempotent — a
 * dataset with the same caller-defined id is reused). Requires the Mastra
 * instance to expose `mastra.datasets`; returns the created/skipped summary.
 */
export async function migrateLegacyEvalCasesToDatasets(
  instance: Mastra,
  options: MigrateDatasetsOptions = {},
): Promise<DatasetMigrationSummary> {
  const skipExisting = options.skipExisting ?? true;
  const created: DatasetMigrationSummary['created'] = [];
  const skipped: EvalDatasetId[] = [];

  for (const [id, raw] of Object.entries(CASES_BY_DATASET) as Array<[EvalDatasetId, unknown[]]>) {
    const items = loadLegacyEvalCases(id);
    if (items.length === 0) {
      dlog.warn('No valid cases to migrate', { datasetId: id });
      skipped.push(id);
      continue;
    }

    let existing: Awaited<ReturnType<typeof instance.datasets.get>> | null = null;
    try {
      existing = await instance.datasets.get({ id });
    } catch {
      existing = null;
    }

    if (existing && skipExisting) {
      skipped.push(id);
      continue;
    }

    const dataset = existing ?? (await instance.datasets.create({
      id,
      name: DATASET_LABELS[id],
      description: `Migrated from the legacy eval case catalog (${items.length} cases).`,
      metadata: { source: 'kestrel-legacy-eval', datasetId: id, migratedAt: new Date().toISOString() },
      inputSchema: z.object({ prompt: z.string(), caseId: z.string() }),
      targetType: 'agent',
      targetIds: ['kestrel-mastra-canonical-chat', 'kestrel-xauusd-research-poc'],
      scorerIds: ['faithfulness', 'hallucination', 'answer-relevancy', 'bias', 'toxicity'],
    }));

    await dataset.addItems({
      items: items.map((item) => {
        const groundTruth: Record<string, unknown> = {
          expectedTools: item.expectedTools ?? [],
          forbiddenTools: item.forbiddenTools ?? [],
          mustContainSubstrings: item.mustContainSubstrings ?? [],
          quality: item.quality ?? {},
        };
        if (item.analysisMode !== undefined) groundTruth.analysisMode = item.analysisMode;
        if (item.expectedAgents !== undefined) groundTruth.expectedAgents = item.expectedAgents;
        if (item.expectedAgentStatuses !== undefined) groundTruth.expectedAgentStatuses = item.expectedAgentStatuses;
        if (item.expectedTerminalStatus !== undefined) groundTruth.expectedTerminalStatus = item.expectedTerminalStatus;
        return {
          externalId: item.id,
          input: { prompt: item.prompt, caseId: item.id },
          groundTruth,
          metadata: { source: 'kestrel-legacy-eval', caseId: item.id },
        };
      }),
    });

    created.push({ id, itemCount: items.length });
  }

  return { created, skipped };
}

export interface RunDatasetExperimentOptions {
  /** Scorers to run against every item. */
  scorers: Array<MastraScorer<string, any, any, any>>;
  /** Gate scorers that must score 1.0 for an item to pass. */
  gates?: Array<MastraScorer<string, any, any, any>>;
  /** Dataset to replay (default: regression). */
  datasetId?: EvalDatasetId;
  /** Max concurrent items. */
  concurrency?: number;
  onItemComplete?: (params: {
    item: { input: { prompt: string; caseId: string } };
    scorerResults: Record<string, unknown>;
  }) => void;
}

export interface DatasetExperimentSummary {
  datasetId: EvalDatasetId;
  total: number;
  passed: number;
  failed: number;
  perScorer: Record<string, { count: number; mean: number }>;
}

/**
 * Replay a dataset against the canonical chat agent with `runEvals`,
 * sampling every item (dataset replay is explicit — no ratio sampling).
 * Returns a summary of pass/fail and per-scorer means. This is the A/B
 * surface: run the same dataset against two agent variants and compare
 * the returned summaries.
 */
export async function runDatasetExperiment<TTarget extends Parameters<typeof runEvals>[0]['target']>(
  instance: Mastra,
  target: TTarget,
  options: RunDatasetExperimentOptions,
): Promise<DatasetExperimentSummary> {
  const datasetId = options.datasetId ?? DATASET_IDS.regression;
  const items = loadLegacyEvalCases(datasetId);
  const data = items.map((item) => ({
    input: { prompt: item.prompt, caseId: item.id },
    groundTruth: {
      expectedTools: item.expectedTools ?? [],
      forbiddenTools: item.forbiddenTools ?? [],
      mustContainSubstrings: item.mustContainSubstrings ?? [],
    },
  }));

  const scorerEntries = options.scorers.map((scorer) => ({
    scorer,
    threshold: 0.5,
  }));

  // `data` and `target` are deliberately widened: the runEvals overloads pick
  // per-target shapes at the call site. Casting keeps the dataset replay
  // target-agnostic (canonical chat agent or symbol-research workflow).
  const result = await runEvals({
    data: data as never,
    target: target as never,
    scorers: scorerEntries as never,
    ...(options.gates && options.gates.length > 0 ? { gates: options.gates as never } : {}),
    ...(options.concurrency ? { concurrency: options.concurrency } : {}),
    onItemComplete: (params) => {
      options.onItemComplete?.({
        item: params.item as unknown as { input: { prompt: string; caseId: string } },
        scorerResults: params.scorerResults as Record<string, unknown>,
      });
    },
  });

  const perScorer: Record<string, { count: number; mean: number }> = {};
  // `thresholdResults` carries the averaged pass outcome per scorer (present
  // when threshold-bearing scorers are configured, which they are here).
  for (const entry of scorerEntries) {
    const id = entry.scorer.id;
    const thresholdResult = result.thresholdResults?.find((candidate) => candidate.id === id);
    perScorer[id] = {
      count: result.summary.totalItems,
      mean: thresholdResult?.averageScore ?? 0,
    };
  }

  const passed = result.gateResults?.length
    ? result.gateResults.filter((gate) => gate.passed).length
    : result.verdict === 'passed'
      ? result.summary.totalItems
      : 0;

  dlog.info('Dataset experiment complete', {
    datasetId,
    total: result.summary.totalItems,
    passed,
    failed: result.summary.totalItems - passed,
    verdict: result.verdict,
  });

  return {
    datasetId,
    total: result.summary.totalItems,
    passed,
    failed: result.summary.totalItems - passed,
    perScorer,
  };
}
