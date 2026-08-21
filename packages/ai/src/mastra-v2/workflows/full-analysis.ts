// SPDX-License-Identifier: Apache-2.0

/**
 * Durable Full-mode analysis queue (Phase 3).
 *
 * `analysis_jobs` is gone: the queue now lives in Mastra's workflow run
 * records. The web route enqueues by writing a `pending` run snapshot for a
 * dedicated `full-analysis` workflow id; the worker claims pending runs,
 * executes the symbol-research workflow under that exact runId (so every
 * repair/verification attempt is observable as run state), and writes the
 * terminal status + shaped result back into the same record. Web polling
 * reads the run record directly — no second queue table to keep in sync.
 *
 * Design notes (verified against the installed @mastra/core):
 * - `Workflow.createRun({ runId })` adopts an existing pending snapshot for
 *   that runId instead of overwriting it, so the worker's execution
 *   continues the record the web enqueued.
 * - The claim is read-verify-write (`persistWorkflowSnapshot`); the storage
 *   API has no conditional status update. In the current deployment there is
 *   a single worker, and message writes are idempotent via
 *   `analysis-job:<runId>:user|assistant` keys, so a double-claim cannot
 *   produce duplicate messages.
 * - `updateWorkflowState` requires an existing `context` in the snapshot, so
 *   enqueues always carry `context.input` (the payload).
 */

import { createHash } from 'node:crypto';

import type { WorkflowRunState } from '@mastra/core/workflows';
import type { WorkflowsStorage } from '@mastra/core/storage';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { getKestrelMastra } from '../instance';

const flog = createCategorizedLogger('ai', { component: 'mastra-full-analysis' });

export const FULL_ANALYSIS_WORKFLOW_ID = 'full-analysis';

/** Payload carried in the run snapshot's `context.input`. */
export interface FullAnalysisPayload {
  kind: 'full-analysis';
  version: 1;
  userId: string;
  threadId: string;
  userMessageText: string;
  userMessageParts: unknown;
  idempotencyKey: string;
  /** Diagnostic traceId from the originating web request. */
  traceId?: string;
  /** Worker attempts so far (bumped at claim time). */
  attemptCount: number;
  createdAt: string;
  /** Worker lease token set at claim time. */
  workerRunId?: string;
  startedAt?: string;
}

/** Public shape returned by the polling endpoint (unchanged contract). */
export interface FullAnalysisRunView {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  progress: Array<Record<string, unknown>>;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface FullAnalysisClaim {
  runId: string;
  payload: FullAnalysisPayload;
}

export interface FullAnalysisEnqueueInput {
  userId: string;
  threadId: string;
  userMessageText: string;
  userMessageParts: unknown;
  idempotencyKey: string;
  traceId?: string;
}

/**
 * Deterministic runId from (userId, idempotencyKey) — mirrors the old unique
 * index on analysis_jobs. The same user + key always resolves to the same
 * run record, so re-submissions return the original terminal result instead
 * of queueing duplicate work.
 */
export function fullAnalysisRunId(userId: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${userId}:${idempotencyKey}`).digest('hex');
}

async function workflowsStore(): Promise<WorkflowsStorage | undefined> {
  const storage = getKestrelMastra().instance.getStorage();
  if (!storage) return undefined;
  const store = await storage.getStore('workflows');
  return (store as WorkflowsStorage | undefined) ?? undefined;
}

// The snapshot JSON is an opaque workflow state blob; spreading it back into
// `persistWorkflowSnapshot` must carry its fields through. `any` (rather than
// `Record<string, any>`) makes object-literal spreads retain an index
// signature so the reconstructed state typechecks against WorkflowRunState.
function parseSnapshot(snapshot: unknown): any {
  if (typeof snapshot === 'string') {
    try {
      return JSON.parse(snapshot) as Record<string, any>;
    } catch {
      return null;
    }
  }
  if (snapshot && typeof snapshot === 'object') return snapshot as Record<string, any>;
  return null;
}

function payloadFromSnapshot(snapshot: Record<string, any> | null): FullAnalysisPayload | null {
  const input = snapshot?.context?.input as FullAnalysisPayload | undefined;
  if (!input || input.kind !== 'full-analysis') return null;
  return input;
}

/**
 * Build the run snapshot's `context` carrying the queue payload. The storage
 * API types `context.input` as a step-result record, but the durable queue
 * stores its own payload there (read back verbatim by payloadFromSnapshot).
 */
function runContext(payload: FullAnalysisPayload): WorkflowRunState['context'] {
  return { input: payload } as unknown as WorkflowRunState['context'];
}

/** Default payload used when a stale run's snapshot is unreadable. */
function fallbackPayload(): FullAnalysisPayload {
  return {
    kind: 'full-analysis',
    version: 1,
    userId: '',
    threadId: '',
    userMessageText: '',
    userMessageParts: [],
    idempotencyKey: '',
    attemptCount: 0,
    createdAt: new Date().toISOString(),
  };
}

function serializeError(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Enqueue a Full-mode analysis job exactly once per (userId, idempotencyKey).
 * Returns the runId to hand to the client; `null` when the run record could
 * not be written (route maps that to a 500).
 */
export async function enqueueFullAnalysis(
  input: FullAnalysisEnqueueInput,
): Promise<string | null> {
  const store = await workflowsStore();
  if (!store) return null;

  const runId = fullAnalysisRunId(input.userId, input.idempotencyKey);
  const existing = await store.getWorkflowRunById({
    runId,
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
  });
  // Exact-once: a previous submission (terminal or still pending) wins.
  if (existing) return runId;

  const payload: FullAnalysisPayload = {
    kind: 'full-analysis',
    version: 1,
    userId: input.userId,
    threadId: input.threadId,
    userMessageText: input.userMessageText,
    userMessageParts: input.userMessageParts,
    idempotencyKey: input.idempotencyKey,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    attemptCount: 0,
    createdAt: new Date().toISOString(),
  };

  await store.persistWorkflowSnapshot({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    runId,
    resourceId: input.userId,      snapshot: {
        runId,
        status: 'pending' as const,
        value: {},
        context: runContext(payload),
        serializedStepGraph: [],
      activePaths: [],
      activeStepsPath: {},
      suspendedPaths: {},
      resumeLabels: {},
      waitingPaths: {},
      timestamp: Date.now(),
    },
  });
  flog.info('Enqueued full-analysis run', { runId, userId: input.userId, threadId: input.threadId });
  return runId;
}

/**
 * Claim the oldest pending full-analysis run. Returns the run + payload or
 * null when the queue is empty. The claim bumps attemptCount and stamps the
 * worker lease token into the payload (the storage API has no conditional
 * update, so the worker re-verifies ownership after writing).
 */
export async function claimNextFullAnalysisRun(
  workerRunId: string,
): Promise<FullAnalysisClaim | null> {
  const store = await workflowsStore();
  if (!store) return null;

  const { runs } = await store.listWorkflowRuns({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    status: 'pending',
    perPage: false,
  });
  // listWorkflowRuns returns newest-first; claim oldest first (FIFO).
  const candidates = runs
    .map((run) => ({ run, snapshot: parseSnapshot(run.snapshot) }))
    .filter(({ snapshot }) => snapshot?.status === 'pending')
    .sort(
      (a, b) =>
        (a.run.createdAt?.getTime?.() ?? 0) - (b.run.createdAt?.getTime?.() ?? 0),
    );

  for (const { run, snapshot } of candidates) {
    if (!snapshot) continue;
    const payload = payloadFromSnapshot(snapshot);
    if (!payload) continue;

    const updated: FullAnalysisPayload = {
      ...payload,
      attemptCount: payload.attemptCount + 1,
      workerRunId,
      startedAt: new Date().toISOString(),
    };
    await store.persistWorkflowSnapshot({
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
      runId: run.runId,
      resourceId: payload.userId,
      snapshot: {
        ...snapshot,
        status: 'running' as const,
        context: { ...snapshot.context, input: updated },
        timestamp: Date.now(),
      },
    });

    // Verify we own the claim (another claimer may have won the race).
    const verify = await store.getWorkflowRunById({
      runId: run.runId,
      workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    });
    const verified = payloadFromSnapshot(parseSnapshot(verify?.snapshot));
    if (verified?.workerRunId === workerRunId && verified.attemptCount === payload.attemptCount + 1) {
      return { runId: run.runId, payload: verified };
    }
  }
  return null;
}

/** Lease heartbeat — bumps `updatedAt` so stale recovery leaves the run alone. */
export async function touchFullAnalysisRun(runId: string): Promise<void> {
  const store = await workflowsStore();
  if (!store) return;
  await store.updateWorkflowState({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    runId,
    opts: { status: 'running' },
  });
}

/** Write the shaped result into the run record (terminal success). */
export async function completeFullAnalysisRun(
  runId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const store = await workflowsStore();
  if (!store) return;
  await store.updateWorkflowState({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    runId,
    // The storage API types `result` as a StepResult wrapper, but the durable
    // queue stores its own shaped payload there (read back verbatim by
    // getFullAnalysisRun). Cast through `never` — the field is opaque.
    opts: { status: 'success', result: result as never },
  });
  flog.info('Completed full-analysis run', { runId });
}

/** Requeue a retryable failure — status back to pending; attempts stay bumped. */
export async function requeueFullAnalysisRun(runId: string, message: string): Promise<void> {
  const store = await workflowsStore();
  if (!store) return;
  await store.updateWorkflowState({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    runId,
    opts: { status: 'pending', error: { name: 'RetryableAnalysisError', message } },
  });
  flog.warn('Requeued full-analysis run', { runId, message });
}

/** Terminal failure — no partial answer is returned (strict contract). */
export async function failFullAnalysisRun(runId: string, error: unknown): Promise<void> {
  const store = await workflowsStore();
  if (!store) return;
  await store.updateWorkflowState({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    runId,
    opts: { status: 'failed', error: serializeError(error) },
  });
  flog.error('Failed full-analysis run', { runId, error: String(error) });
}

/**
 * Recover stale `running` runs: requeue while attempts remain, otherwise mark
 * terminal failed (same bounded-attempt policy as the old worker).
 */
export async function recoverStaleFullAnalysisRuns(
  staleCutoff: Date,
  maxAttempts: number,
): Promise<{ requeued: number; failed: number }> {
  const store = await workflowsStore();
  if (!store) return { requeued: 0, failed: 0 };

  const { runs } = await store.listWorkflowRuns({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    status: 'running',
    perPage: false,
  });

  let requeued = 0;
  let failed = 0;
  for (const run of runs) {
    const updatedAt = run.updatedAt instanceof Date ? run.updatedAt.getTime() : Date.now();
    if (updatedAt >= staleCutoff.getTime()) continue;

    const snapshot = parseSnapshot(run.snapshot);
    if (!snapshot) continue;
    const payload = payloadFromSnapshot(snapshot);
    const attempts = payload?.attemptCount ?? 1;

    if (attempts < maxAttempts) {
      const requeuedPayload: FullAnalysisPayload = { ...(payload ?? fallbackPayload()) };
      // Clear the lease: a requeued run must be claimable again.
      delete requeuedPayload.workerRunId;
      delete requeuedPayload.startedAt;
      await store.persistWorkflowSnapshot({
        workflowName: FULL_ANALYSIS_WORKFLOW_ID,
        runId: run.runId,
        resourceId: requeuedPayload.userId,
        snapshot: {
          ...snapshot,
          status: 'pending' as const,
          context: { ...snapshot.context, input: requeuedPayload },
          timestamp: Date.now(),
        },
      });
      requeued += 1;
    } else {
      await store.updateWorkflowState({
        workflowName: FULL_ANALYSIS_WORKFLOW_ID,
        runId: run.runId,
        opts: {
          status: 'failed',
          error: { name: 'JobTimeoutError', message: 'Job timed out — maximum worker attempts reached.' },
        },
      });
      failed += 1;
    }
  }
  if (requeued > 0 || failed > 0) {
    flog.warn('Recovered stale full-analysis runs', { requeued, failed, maxAttempts });
  }
  return { requeued, failed };
}

/** Delete terminal runs older than the retention cutoff. */
export async function purgeOldFullAnalysisRuns(retentionCutoff: Date): Promise<number> {
  const store = await workflowsStore();
  if (!store) return 0;

  const { runs } = await store.listWorkflowRuns({
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
    perPage: false,
  });
  const TERMINAL = new Set(['success', 'failed', 'canceled', 'bailed', 'skipped']);
  let deleted = 0;
  for (const run of runs) {
    const snapshot = parseSnapshot(run.snapshot);
    if (!snapshot || !TERMINAL.has(snapshot.status)) continue;
    const updatedAt = run.updatedAt instanceof Date ? run.updatedAt.getTime() : Date.now();
    if (updatedAt < retentionCutoff.getTime()) {
      await store.deleteWorkflowRunById({
        runId: run.runId,
        workflowName: FULL_ANALYSIS_WORKFLOW_ID,
      });
      deleted += 1;
    }
  }
  if (deleted > 0) flog.info('Purged old full-analysis runs', { deleted });
  return deleted;
}

const STATUS_MAP: Record<string, FullAnalysisRunView['status']> = {
  pending: 'pending',
  running: 'running',
  success: 'complete',
  failed: 'failed',
  canceled: 'failed',
  bailed: 'failed',
};

export interface FullAnalysisQueueHealth {
  pending: number;
  running: number;
  stalePending: number;
  stuckRunning: number;
  /** Set when the workflows domain is unavailable (graceful degradation). */
  unavailable?: boolean;
}

/**
 * Light queue-health snapshot for the /api/health endpoint. Mirrors the old
 * analysis_jobs health query: stale pending (>10 min) signals the worker is
 * not claiming; stuck running (>30 s without a heartbeat) signals a dead
 * worker lease.
 */
export async function getFullAnalysisQueueHealth(): Promise<FullAnalysisQueueHealth> {
  const store = await workflowsStore();
  if (!store) return { pending: 0, running: 0, stalePending: 0, stuckRunning: 0, unavailable: true };
  try {
    const [pendingList, runningList] = await Promise.all([
      store.listWorkflowRuns({ workflowName: FULL_ANALYSIS_WORKFLOW_ID, status: 'pending', perPage: false }),
      store.listWorkflowRuns({ workflowName: FULL_ANALYSIS_WORKFLOW_ID, status: 'running', perPage: false }),
    ]);
    const now = Date.now();
    const stalePending = pendingList.runs.filter((run) => {
      const createdAt = run.createdAt instanceof Date ? run.createdAt.getTime() : now;
      return now - createdAt > 10 * 60 * 1_000;
    }).length;
    const stuckRunning = runningList.runs.filter((run) => {
      const updatedAt = run.updatedAt instanceof Date ? run.updatedAt.getTime() : now;
      return now - updatedAt > 30_000;
    }).length;
    return {
      pending: pendingList.runs.length,
      running: runningList.runs.length,
      stalePending,
      stuckRunning,
    };
  } catch {
    return { pending: 0, running: 0, stalePending: 0, stuckRunning: 0, unavailable: true };
  }
}

/**
 * Read a full-analysis run for the polling endpoint. User-scoped: a run that
 * belongs to a different user is treated as not found.
 */
export async function getFullAnalysisRun(
  userId: string,
  runId: string,
): Promise<FullAnalysisRunView | null> {
  const store = await workflowsStore();
  if (!store) return null;

  const run = await store.getWorkflowRunById({
    runId,
    workflowName: FULL_ANALYSIS_WORKFLOW_ID,
  });
  if (!run || (run.resourceId && run.resourceId !== userId)) return null;

  const snapshot = parseSnapshot(run.snapshot);
  const status: FullAnalysisRunView['status'] = STATUS_MAP[snapshot?.status] ?? 'pending';
  const createdAt = run.createdAt instanceof Date ? run.createdAt.toISOString() : null;
  const updatedAt = run.updatedAt instanceof Date ? run.updatedAt.toISOString() : null;
  const terminal = status === 'complete' || status === 'failed';

  return {
    id: runId,
    status,
    progress: [],
    result: (snapshot?.result as Record<string, unknown> | undefined) ?? null,
    error:
      status === 'failed'
        ? 'Full analysis could not be completed. No partial answer was returned.'
        : null,
    createdAt,
    completedAt: terminal ? updatedAt : null,
  };
}
