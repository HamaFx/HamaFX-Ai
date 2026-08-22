// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 8 — unified Mastra run view.
 *
 * The admin "Mastra Runs" viewer joins three runId-keyed surfaces into one
 * row so a single run id answers "which stage failed, which provider, what
 * did it cost, was it grounded":
 *
 *   - DB telemetry   (`chat_telemetry`, kind `mastra_*`) → provider, model,
 *                     tokens, cost, latency, trace id.
 *   - Workflow state (`storage.workflows.loadWorkflowSnapshot`) → stage,
 *                     step statuses, run status.
 *   - Scores         (`storage.scores`) → grounding/citation/faithfulness.
 *
 * The projection is pure (no DB access) — the web route supplies the telemetry
 * row and the Mastra instance, so this module is unit-testable without a
 * database.
 */

import type { Mastra } from '@mastra/core';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { listScoresForRun, type ScoreRecord } from './evals/scores';
import { langfuseTraceUrl } from './telemetry';

const vlog = createCategorizedLogger('ai', { component: 'mastra-runs-view' });

/** Minimal projection of a `chat_telemetry` row used by the runs viewer. */
export interface RunTelemetryRow {
  runId: string | null;
  traceId: string | null;
  threadId: string | null;
  userId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  kind: string | null;
  createdAt: Date;
}

/** Known workflow ids whose snapshots back Mastra runs (from the registry). */
export const MASTRA_WORKFLOW_IDS = [
  'symbol-research',
  'full-analysis',
  'xauusd-report',
] as const;

/** Map a telemetry kind to the workflow id that would hold its run state. */
export function workflowIdForKind(kind: string | null): string | null {
  if (!kind) return null;
  if (kind.startsWith('mastra_full_job')) return 'full-analysis';
  if (kind.startsWith('mastra_mode')) return 'symbol-research';
  if (kind.startsWith('mastra_xauusd')) return 'xauusd-report';
  if (kind.startsWith('mastra_canonical_chat')) return null;
  return null;
}

/** Derive the provider from a model id (`google/…`, `google-vertex/…`, …). */
export function providerFromModel(model: string): string {
  const slash = model.indexOf('/');
  if (slash > 0) return model.slice(0, slash);
  const at = model.indexOf(':');
  if (at > 0) return model.slice(0, at);
  return 'unknown';
}

export interface WorkflowRunStatusView {
  workflowId: string | null;
  status: string | null;
  failedSteps: string[];
  completedSteps: number;
  totalSteps: number;
}

/** Summarize a workflow run snapshot into a compact status view. */
export function summarizeWorkflowRunState(
  snapshot: WorkflowRunState | null,
  workflowId: string,
): WorkflowRunStatusView {
  if (!snapshot) return { workflowId: null, status: null, failedSteps: [], completedSteps: 0, totalSteps: 0 };
  const failedSteps: string[] = [];
  let completedSteps = 0;
  let totalSteps = 0;
  const steps = (snapshot as unknown as { steps?: Record<string, unknown> }).steps ?? {};
  for (const [stepId, step] of Object.entries(steps)) {
    totalSteps += 1;
    const candidate = step as { status?: string; output?: { ok?: boolean } } | undefined;
    if (candidate?.status === 'failed' || candidate?.output?.ok === false) failedSteps.push(stepId);
    if (candidate?.status === 'succeeded' || candidate?.status === 'completed') completedSteps += 1;
  }
  return {
    workflowId,
    status: snapshot.status ?? null,
    failedSteps,
    completedSteps,
    totalSteps,
  };
}

export interface MastraRunScoreView {
  scorerId: string;
  score: number;
  source: ScoreRecord['source'];
  reason?: string;
}

export interface MastraRunView {
  runId: string;
  kind: string | null;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  ms: number;
  estCostUsd: number;
  createdAt: string;
  traceId: string | null;
  langfuseUrl: string | null;
  workflow: WorkflowRunStatusView;
  scores: MastraRunScoreView[];
  /** Best summary score (mean of available scores), for quick sorting. */
  scoreMean: number | null;
}

/**
 * Build the unified view for one telemetry row.
 *
 * `instance` may be undefined in minimal test setups — the view degrades to
 * telemetry-only (no workflow/scores) rather than throwing.
 */
export async function toMastraRunView(
  row: RunTelemetryRow,
  instance: Mastra | undefined,
): Promise<MastraRunView> {
  const runId = row.runId ?? '';
  const workflowId = workflowIdForKind(row.kind);

  let workflow: WorkflowRunStatusView = { workflowId: null, status: null, failedSteps: [], completedSteps: 0, totalSteps: 0 };
  let scores: MastraRunScoreView[] = [];

  if (instance) {
    if (workflowId) {
      const storage = instance.getStorage() as
        | (typeof instance extends never ? never : { getStore?: (domain: string) => Promise<unknown> })
        | null;
      try {
        if (storage && typeof storage.getStore === 'function') {
          const workflowsDomain = (await storage.getStore('workflows')) as
            | { loadWorkflowSnapshot(input: { workflowName: string; runId: string }): Promise<WorkflowRunState | null> }
            | undefined;
          if (workflowsDomain && typeof workflowsDomain.loadWorkflowSnapshot === 'function') {
            const snapshot = await workflowsDomain.loadWorkflowSnapshot({
              workflowName: workflowId,
              runId,
            });
            workflow = summarizeWorkflowRunState(snapshot, workflowId);
          }
        }
      } catch (error) {
        vlog.warn('Failed to load workflow snapshot for run view', {
          runId,
          workflowId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const scoreRecords = await listScoresForRun(instance, runId);
    scores = scoreRecords.map((record) => ({
      scorerId: record.scorerId,
      score: record.score,
      source: record.source,
      ...(record.reason ? { reason: record.reason } : {}),
    }));
  }

  const scoreMean =
    scores.length > 0
      ? scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length
      : null;

  return {
    runId,
    kind: row.kind,
    model: row.model,
    provider: providerFromModel(row.model),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    toolCalls: row.toolCalls,
    ms: row.ms,
    estCostUsd: row.estCostUsd,
    createdAt: row.createdAt.toISOString(),
    traceId: row.traceId,
    langfuseUrl: row.traceId ? langfuseTraceUrl(row.traceId) : null,
    workflow,
    scores,
    scoreMean,
  };
}
