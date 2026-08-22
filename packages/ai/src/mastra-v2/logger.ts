// SPDX-License-Identifier: Apache-2.0

/**
 * Mastra logger adapter (Phase 0).
 *
 * Routes Mastra's internal logging into Kestrel's single structured pino
 * stream (`@kestrel/shared/logger`) with the `ai` category and a `mastra`
 * component tag, so Mastra framework logs appear alongside application logs
 * with the same redaction, trace correlation, and log-stream delivery.
 */

import type { IMastraLogger, LogLevel, LoggerTransport, BaseLogMessage } from '@mastra/core/logger';
import { createCategorizedLogger, logErrorContext, type CategorizedLogger } from '@kestrel/shared/logger';

/** Mastra's `LogLevel` is a subset of pino's; route both error-ish levels to error. */
function pinoLevel(level: LogLevel | undefined): 'debug' | 'info' | 'warn' | 'error' {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Adapter that forwards Mastra logger calls into the shared categorized pino
 * logger. Mastra's `listLogs`/`listLogsByRunId` surfaces are intentionally
 * empty: Kestrel owns log persistence and streaming (see the admin log
 * stream), so Mastra transports are not registered.
 *
 * Correlation: every line carries `traceId`/`requestId`/`runId` from the
 * shared AsyncLocalStorage when a diagnostic scope is active (Phase 8).
 */
export class MastraPinoLogger implements IMastraLogger {
  private readonly log = createCategorizedLogger('ai', { component: 'mastra' });

  debug(message: string, ...args: unknown[]): void {
    this.log.debug(message, this.argsToMeta(args));
  }

  info(message: string, ...args: unknown[]): void {
    this.log.info(message, this.argsToMeta(args));
  }

  warn(message: string, ...args: unknown[]): void {
    this.log.warn(message, this.argsToMeta(args));
  }

  error(message: string, ...args: unknown[]): void {
    this.log.error(message, this.argsToMeta(args));
  }

  trackException(error: Error, metadata?: Record<string, unknown>): void {
    logErrorContext(error, 'mastra.trackException', metadata ?? {}, 'ai');
  }

  getTransports(): Map<string, LoggerTransport> {
    return new Map();
  }

  async listLogs(
    _transportId: string,
    _params?: {
      fromDate?: Date;
      toDate?: Date;
      logLevel?: LogLevel;
      filters?: Record<string, unknown>;
      page?: number;
      perPage?: number;
    },
  ): Promise<{ logs: BaseLogMessage[]; total: number; page: number; perPage: number; hasMore: boolean }> {
    return { logs: [], total: 0, page: 1, perPage: 50, hasMore: false };
  }

  async listLogsByRunId(_args: {
    transportId: string;
    runId: string;
    fromDate?: Date;
    toDate?: Date;
    logLevel?: LogLevel;
    filters?: Record<string, unknown>;
    page?: number;
    perPage?: number;
  }): Promise<{ logs: BaseLogMessage[]; total: number; page: number; perPage: number; hasMore: boolean }> {
    return { logs: [], total: 0, page: 1, perPage: 50, hasMore: false };
  }

  /** Attach primitive extra args as numbered fields; drop objects (pino handles the first meta arg). */
  private argsToMeta(args: unknown[]): Record<string, unknown> | undefined {
    if (args.length === 0) return undefined;
    const first = args[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
    const entries: Array<[string, unknown]> = [];
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        entries.push([`arg${index}`, value]);
      }
    }
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Run-scoped workflow logging (Phase 8)
//
// Mastra workflow steps execute inside their own async context, so the
// shared AsyncLocalStorage correlation is not always propagated. These
// helpers bind run identity explicitly and log the workflow run lifecycle
// (start / end / error) with the runId, so pino, the log stream, and the
// admin runs viewer can correlate a log line back to a specific run.
// ---------------------------------------------------------------------------

export interface RunStepLogIdentity {
  runId: string;
  workflowId: string;
  /** Optional agent id when the step is an agent call. */
  agentId?: string;
  /** Optional human-readable stage name (e.g. 'draft', 'execute'). */
  stepId?: string;
}

/**
 * Create a logger bound to a specific Mastra run. Every line carries the
 * runId (and optional workflowId/stepId) regardless of AsyncLocalStorage
 * state, so a workflow executing in the worker process still logs under its
 * run identity.
 */
export function createRunLogger(identity: RunStepLogIdentity): CategorizedLogger {
  const context: Record<string, unknown> = { component: 'mastra-run', runId: identity.runId };
  if (identity.workflowId) context['workflowId'] = identity.workflowId;
  if (identity.agentId) context['agentId'] = identity.agentId;
  if (identity.stepId) context['stepId'] = identity.stepId;
  return createCategorizedLogger('ai', context);
}

export interface WorkflowStepLogArgs extends RunStepLogIdentity {
  /** Human message describing the lifecycle event. */
  message: string;
  /** Additional non-sensitive context (e.g. mode, symbol, outcome). */
  meta?: Record<string, unknown>;
}

/** Log the start of a workflow run (or step). */
export function logWorkflowStart(args: WorkflowStepLogArgs): void {
  createRunLogger(args).info(args.message, args.meta ?? {});
}

/** Log the successful end of a workflow run (or step) with its duration. */
export function logWorkflowEnd(
  args: WorkflowStepLogArgs & { startedAt: number; durationMs?: number },
): void {
  const durationMs = args.durationMs ?? Math.max(0, Date.now() - args.startedAt);
  createRunLogger(args).info(args.message, {
    ...(args.meta ?? {}),
    durationMs,
    outcome: 'success',
  });
}

/** Log a workflow failure with the error and its duration. */
export function logWorkflowError(
  args: WorkflowStepLogArgs & { startedAt: number; error?: unknown },
): void {
  const logger = createRunLogger(args);
  const durationMs = Math.max(0, Date.now() - args.startedAt);
  const meta: Record<string, unknown> = { ...(args.meta ?? {}), durationMs, outcome: 'failed' };
  if (args.error !== undefined) {
    logErrorContext(args.error, `mastra.workflow.${args.workflowId}`, meta, 'ai');
  } else {
    logger.error(args.message, meta);
  }
}
