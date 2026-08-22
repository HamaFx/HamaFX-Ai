// SPDX-License-Identifier: Apache-2.0

/**
 * Phase 7 mutations — suspend/resume confirmation workflows.
 *
 * One workflow factory per mutation kind (alert, journal, share, operator
 * action). The graph is intentionally small and fully deterministic — no
 * LLM, no tools — because the mutation path must never delegate the decision
 * to the model:
 *
 *   draft (validate + dry-run, issue single-use expiring token, suspend)
 *     → execute (resume branch confirms; then audited Drizzle write)
 *     → notify (returns the executed result)
 *
 * Mastra resumes a suspended workflow by re-running the suspended step with
 * `resumeData`, so the `draft` step carries both branches: the first pass
 * validates + suspends, the resume pass confirms and returns the full input.
 * The `execute` step then runs the injected executor exactly once with that
 * confirmed input and writes the audit row. After confirmation the run leaves
 * the suspended state — a second resume with the same token fails because the
 * run is no longer suspended (single-use).
 *
 * The write executor + audit writer are injected by the composition edge
 * (web route), which owns the Drizzle connection per DIP-1. The workflow
 * itself never imports `getDb`.
 */

import { randomBytes } from 'node:crypto';
import type { Mastra } from '@mastra/core';
import { Workflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

import { SymbolSchema } from '@kestrel/shared';
import { AlertChannelSchema, AlertRuleSchema } from '@kestrel/shared/schemas/alerts';

import {
  assertMastraMutationAllowed,
  assertMastraMutationDraftAllowed,
  MUTATION_TOKEN_TTL_MS,
  storedConfirmationForToken,
  verifyMutationConfirmationToken,
} from '../../mastra/mutation-policy';
import { logWorkflowEnd, logWorkflowError, logWorkflowStart } from '../logger';
import { runTracingOptions } from '../telemetry';

// --- schemas ---------------------------------------------------------------

export const MutationKindSchema = z.enum([
  'set_alert',
  'log_journal',
  'share_snapshot',
  'run_system_action',
]);
export type MutationKind = z.infer<typeof MutationKindSchema>;

/** Discriminated input by mutation kind — the workflow factory selects the branch. */
export const MutationInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_alert'),
    rule: AlertRuleSchema,
    channels: z.array(AlertChannelSchema).optional(),
    note: z.string().nullable().optional(),
    snoozeHours: z.number().int().min(0).max(168).optional(),
  }),
  z.object({
    kind: z.literal('log_journal'),
    symbol: SymbolSchema,
    side: z.enum(['long', 'short']),
    openedAt: z.number().int(),
    entry: z.number(),
    stop: z.number().nullable().optional(),
    target: z.number().nullable().optional(),
    exit: z.number().nullable().optional(),
    size: z.number().nullable().optional(),
    outcome: z.enum(['win', 'loss', 'breakeven', 'open']).optional(),
    rMultiple: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('share_snapshot'),
    title: z.string().min(2).max(200),
    body: z.string().min(2).max(8000),
    symbol: SymbolSchema.optional(),
    tf: z.string().optional(),
    /** Minutes until the share link expires (5 min .. 30 days). */
    ttlMinutes: z
      .number()
      .int()
      .min(5)
      .max(30 * 24 * 60)
      .optional(),
  }),
  z.object({
    kind: z.literal('run_system_action'),
    action: z.string().min(1).max(200),
    params: z.record(z.unknown()).optional(),
  }),
]);
export type MutationInput = z.infer<typeof MutationInputSchema>;

/** Payload the client receives after draft — the confirmation card data. */
export const MutationSuspendPayloadSchema = z.object({
  mutation: MutationKindSchema,
  summary: z.string(),
  runId: z.string(),
  /** Owning thread — returned so the confirm route can re-check policy context. */
  threadId: z.string().min(1),
  /** ms epoch UTC — the confirmation expires. */
  expiresAt: z.number().int(),
  /**
   * Single-use bearer token the client presents on resume. The server keeps
   * only its HMAC digest in the run snapshot — the raw token exists only in
   * this payload.
   */
  confirmationToken: z.string(),
  confirmLabel: z.string().default('Confirm'),
  cancelLabel: z.string().default('Cancel'),
});
export type MutationSuspendPayload = z.infer<typeof MutationSuspendPayloadSchema>;

/** Resume input: the single-use token minted at draft time. */
export const MutationResumeSchema = z.object({
  confirmationToken: z.string().min(1),
});
export type MutationResumeInput = z.infer<typeof MutationResumeSchema>;

export const MutationOutputSchema = z.object({
  status: z.enum(['executed', 'rejected']),
  mutation: MutationKindSchema,
  resultId: z.string().nullable(),
  url: z.string().nullable(),
  summary: z.string(),
});
export type MutationOutput = z.infer<typeof MutationOutputSchema>;

/** Draft step output after confirmation — the full input, marked confirmed. */
const ConfirmedInputSchema = z.object({
  confirmed: z.literal(true),
  input: MutationInputSchema,
});

// --- executor contracts ----------------------------------------------------

export interface MutationExecutorResult {
  id: string;
  url?: string;
}

/** Executes the audited write. Injected by the composition edge (web route). */
export type MutationExecutor = (input: MutationInput) => Promise<MutationExecutorResult>;

export interface MutationWorkflowDeps {
  /** Mutation kind this workflow implements (fixes the input branch). */
  mutation: MutationKind;
  userId: string;
  threadId: string;
  /** Executes the Drizzle write. Owned by the web route (DIP-1). */
  execute: MutationExecutor;
  /** Best-effort audit writer (fail open). */
  writeAudit: (userId: string, action: string, metadata: Record<string, unknown>) => Promise<void>;
  /** Shared Mastra instance for run-snapshot persistence (optional). */
  mastra?: Mastra;
  /** Confirmation TTL. Defaults to the policy default (15 min). */
  ttlMs?: number;
  /** Clock override for tests. */
  now?: () => number;
  /** HMAC secret override for tests. */
  secret?: string;
}

interface MutationState {
  confirmation?: { digest: string; expiresAt: number };
  threadId?: string;
}

function humanSummary(input: MutationInput): string {
  switch (input.kind) {
    case 'set_alert':
      return `Set alert on ${input.rule.symbol} (${input.rule.type})${input.note ? ` — ${input.note}` : ''}`;
    case 'log_journal':
      return `Log ${input.side} ${input.symbol} journal entry @ ${input.entry}`;
    case 'share_snapshot':
      return `Share snapshot “${input.title}”${input.symbol ? ` for ${input.symbol}` : ''}`;
    case 'run_system_action':
      return `Run system action: ${input.action}`;
    default:
      return 'Unknown mutation';
  }
}

function mutationDisplayName(mutation: MutationKind): string {
  return mutation.replaceAll('_', ' ');
}

function mutationPolicyError(reason: 'token-invalid' | 'token-expired'): Error {
  const error = new Error(
    reason === 'token-expired'
      ? 'Mastra mutation confirmation token has expired.'
      : 'Mastra mutation confirmation token is invalid.',
  );
  error.name = 'MastraMutationPolicyError';
  Object.assign(error, {
    code: `MASTRA_MUTATION_${reason.toUpperCase().replaceAll('-', '_')}`,
  });
  return error;
}

/**
 * Build the confirmation workflow for one mutation kind.
 *
 * `createRun({ runId })` starts a run that suspends at `draft` with the
 * confirmation card payload; `run.resume({ step: 'draft', resumeData })`
 * confirms it. The graph:
 *
 *   draft → execute → notify
 *
 * `draft` suspends on first pass; on resume it verifies the token + expiry +
 * policy and returns the confirmed input. `execute` performs the write with
 * that input and writes the audit row. `notify` returns the output.
 */
export function createMutationWorkflow(
  deps: MutationWorkflowDeps,
): Workflow<any, any, string, unknown, unknown, unknown> {
  const mutation = deps.mutation;
  const secret = deps.secret;
  const now = deps.now ?? Date.now;

  const draftStep = createStep({
    id: 'draft',
    inputSchema: MutationInputSchema,
    outputSchema: ConfirmedInputSchema,
    resumeSchema: MutationResumeSchema,
    suspendSchema: MutationSuspendPayloadSchema,
    stateSchema: z.object({
      confirmation: z
        .object({ digest: z.string(), expiresAt: z.number().int() })
        .optional(),
      threadId: z.string().optional(),
    }),
    execute: async ({ inputData, resumeData, suspend, state, setState, runId }) => {
      // First pass — validate + dry-run + issue token + suspend.
      if (!resumeData) {
        // Draft gate before any state is written: enabled + valid context.
        // Confirmation is intentionally NOT required here — this is the start
        // of the confirmation flow.
        assertMastraMutationDraftAllowed({
          mutation,
          userId: deps.userId,
          threadId: deps.threadId,
        });

        const token = randomBytes(32).toString('base64url');
        const expiresAt = now() + (deps.ttlMs ?? MUTATION_TOKEN_TTL_MS);
        const storedOptions: Parameters<typeof storedConfirmationForToken>[1] = {
          mutation,
          userId: deps.userId,
          expiresAt,
        };
        if (secret) storedOptions.secret = secret;
        const stored = storedConfirmationForToken(token, storedOptions);
        await setState({
          ...(state ?? {}),
          confirmation: { digest: stored.digest, expiresAt: stored.expiresAt },
          threadId: deps.threadId,
        });

        return suspend({
          mutation,
          summary: humanSummary(inputData),
          runId,
          threadId: deps.threadId,
          expiresAt,
          confirmationToken: token,
          confirmLabel: `Confirm ${mutationDisplayName(mutation)}`,
          cancelLabel: 'Cancel',
        });
      }

      // Resume pass — confirm: timing-safe token + expiry + policy.
      const stored = (state as MutationState | undefined)?.confirmation;
      if (!stored) {
        throw mutationPolicyError('token-invalid');
      }
      const verifyOptions: Parameters<typeof verifyMutationConfirmationToken>[0] = {
        token: resumeData.confirmationToken,
        stored,
        mutation,
        userId: deps.userId,
        now: now(),
      };
      if (secret) verifyOptions.secret = secret;
      const tokenOk = verifyMutationConfirmationToken(verifyOptions);
      if (!tokenOk) {
        throw mutationPolicyError(
          now() > stored.expiresAt ? 'token-expired' : 'token-invalid',
        );
      }
      assertMastraMutationAllowed({
        mutation,
        userId: deps.userId,
        threadId: (state as MutationState | undefined)?.threadId ?? deps.threadId,
        confirmed: true,
        approvalId: runId,
      });

      return { confirmed: true as const, input: inputData };
    },
  });

  const executeStep = createStep({
    id: 'execute',
    inputSchema: ConfirmedInputSchema,
    outputSchema: MutationOutputSchema,
    execute: async ({ inputData, runId }) => {
      const result = await deps.execute(inputData.input);
      const summary = humanSummary(inputData.input);
      await deps.writeAudit(deps.userId, `mutation.${mutation}.executed`, {
        mutation,
        runId,
        threadId: deps.threadId,
        resultId: result.id,
        kind: inputData.input.kind,
      });
      return {
        status: 'executed' as const,
        mutation,
        resultId: result.id,
        url: result.url ?? null,
        summary,
      };
    },
  });

  const notifyStep = createStep({
    id: 'notify',
    inputSchema: MutationOutputSchema,
    outputSchema: MutationOutputSchema,
    execute: async ({ inputData }) => inputData,
  });

  return new Workflow({
    id: `mutation-${mutation}`,
    inputSchema: MutationInputSchema,
    outputSchema: MutationOutputSchema,
    ...(deps.mastra ? { mastra: deps.mastra } : {}),
  })
    .then(draftStep)
    .then(executeStep)
    .then(notifyStep)
    .commit() as unknown as Workflow<any, any, string, unknown, unknown, unknown>;
}

// --- driver -----------------------------------------------------------------

export interface RunMutationResult {
  status: 'suspended' | 'executed';
  runId: string;
  suspendPayload?: MutationSuspendPayload;
  output?: MutationOutput;
}

/**
 * Start (or resume) a mutation run.
 *
 * - `resumeData` absent → starts the workflow with `input`; returns the
 *   suspension payload (confirmation card data) with status `suspended`.
 * - `resumeData` present → resumes the run by id; the draft step's resume
 *   branch re-validates the token, then execute + notify run with the input
 *   persisted in the run snapshot. Returns the executed output.
 */
export async function runMutationWorkflow(
  workflow: ReturnType<typeof createMutationWorkflow>,
  options: {
    input?: MutationInput;
    runId?: string;
    resumeData?: MutationResumeInput;
    /** User id for trace linkage (fallback to the workflow's deps user). */
    userId?: string;
    threadId?: string;
  },
): Promise<RunMutationResult> {
  const createRunOptions: { runId?: string } = {};
  if (options.runId) createRunOptions.runId = options.runId;
  const run = await workflow.createRun(createRunOptions);
  const runId = run.runId;
  const startedAt = Date.now();
  const runLog = {
    runId,
    workflowId: `mutation-${workflowMutationKind(workflow)}`,
    stepId: options.resumeData ? 'confirm' : 'draft',
  };

  if (options.resumeData) {
    if (!options.runId) {
      throw new Error('runId is required to resume a mutation run');
    }
    logWorkflowStart({
      ...runLog,
      message: 'Mutation run resuming for confirmation',
    });
    try {
      const result = await run.resume({
        step: 'draft',
        resumeData: options.resumeData,
        ...(options.userId && options.threadId
          ? {
              tracingOptions: runTracingOptions({
                runId,
                userId: options.userId,
                threadId: options.threadId,
                kind: `mutation-${workflowMutationKind(workflow)}`,
                tags: ['mutation'],
              }),
            }
          : {}),
      });
      if (result.status === 'success') {
        // The workflow's terminal step returns the MutationOutput; it is not
        // surfaced on the top-level result, so read it from the notify step.
        const output = extractMutationOutput(result);
        logWorkflowEnd({ ...runLog, startedAt, message: 'Mutation run executed' });
        return { status: 'executed', runId, output };
      }
      if (result.status === 'failed' && result.error) {
        throw result.error;
      }
      throw new Error(`Mutation resume failed with status ${result.status}`);
    } catch (error) {
      logWorkflowError({ ...runLog, startedAt, message: 'Mutation confirmation failed', error });
      throw error;
    }
  }

  if (!options.input) {
    throw new Error('input is required to start a mutation run');
  }
  logWorkflowStart({
    ...runLog,
    message: 'Mutation run drafting for confirmation',
    meta: { mutation: options.input.kind },
  });
  try {
    const result = await run.start({
      inputData: options.input,
      ...(options.userId && options.threadId
        ? {
            tracingOptions: runTracingOptions({
              runId,
              userId: options.userId,
              threadId: options.threadId,
              kind: `mutation-${workflowMutationKind(workflow)}`,
              tags: ['mutation'],
            }),
          }
        : {}),
    });
    if (result.status === 'suspended') {
      const suspended = result.suspended[0];
      const stepKey = suspended?.[0];
      const payload =
        stepKey !== undefined
          ? (result.steps[stepKey]?.suspendPayload as MutationSuspendPayload | undefined)
          : undefined;
      const runResult: RunMutationResult = { status: 'suspended', runId };
      if (payload) runResult.suspendPayload = payload;
      return runResult;
    }
    if (result.status === 'failed' && result.error) {
      // Propagate the underlying policy error (disabled, invalid context, ...)
      // so callers can react to the actual reason instead of a generic wrapper.
      throw toError(result.error);
    }
    throw new Error(`Mutation run did not suspend as expected (status ${result.status})`);
  } catch (error) {
    logWorkflowError({ ...runLog, startedAt, message: 'Mutation draft failed', error });
    throw error;
  }
}

/** Read the mutation kind from a built workflow (used for log identity). */
function workflowMutationKind(workflow: ReturnType<typeof createMutationWorkflow>): string {
  const id = (workflow as unknown as { id?: string }).id ?? '';
  return id.replace(/^mutation-/, '');
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = String((value as { message: unknown }).message);
    const error = new Error(message);
    if ('name' in value) error.name = String((value as { name: unknown }).name);
    if ('code' in value) Object.assign(error, { code: (value as { code: unknown }).code });
    return error;
  }
  return new Error(String(value));
}

/** Pull the notify-step output from a successful resume result. */
function extractMutationOutput(result: { steps: Record<string, unknown> }): MutationOutput {
  const stepResult = result.steps['notify'];
  const candidate = stepResult as { output?: unknown } | undefined;
  if (candidate && typeof candidate === 'object' && candidate.output !== undefined) {
    return MutationOutputSchema.parse(candidate.output);
  }
  throw new Error('Mutation resume succeeded but produced no output.');
}
