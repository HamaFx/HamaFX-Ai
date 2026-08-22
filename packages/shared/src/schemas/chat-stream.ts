// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

const baseEvent = z.object({ id: z.string() });

export const TextStartEventSchema = baseEvent.extend({ type: z.literal('text-start') });
export const TextDeltaEventSchema = baseEvent.extend({
  type: z.literal('text-delta'),
  delta: z.string(),
});
export const TextEndEventSchema = baseEvent.extend({ type: z.literal('text-end') });
export const MultiAgentMetaEventSchema = baseEvent.extend({
  type: z.literal('data-multi-agent-meta'),
  data: z.record(z.unknown()),
  transient: z.boolean().optional(),
});
export const AgentProgressEventSchema = z.object({
  type: z.literal('data-agent-progress'),
  // Intentionally id-less: the tracker lives in @kestrel/ai and does not
  // know the message id. The transport synthesizes its own id for the
  // resulting AI SDK data stream.
  data: z.unknown(),
});
export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  errorText: z.string(),
});
export const AnalysisQueuedEventSchema = z.object({
  type: z.literal('analysis-queued'),
  jobId: z.string(),
  status: z.string(),
});

/**
 * The server's chat route returns this JSON when a prompt is routed to the
 * mutation confirmation workflow. The payload is the draft's suspend card:
 * the client renders it and presents the single-use token back on confirm.
 */
export const MutationDraftPayloadSchema = z.object({
  mutation: z.enum(['set_alert', 'log_journal', 'share_snapshot', 'run_system_action']),
  summary: z.string(),
  runId: z.string(),
  threadId: z.string(),
  expiresAt: z.number().int(),
  confirmationToken: z.string(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
});
export type MutationDraftPayload = z.infer<typeof MutationDraftPayloadSchema>;

export const MutationDraftEventSchema = z.object({
  type: z.literal('mutation-draft'),
  payload: MutationDraftPayloadSchema,
});
export type MutationDraftEvent = z.infer<typeof MutationDraftEventSchema>;

export const MutationConfirmResultSchema = z.object({
  ok: z.boolean(),
  status: z.literal('executed'),
  runId: z.string(),
  output: z
    .object({
      status: z.enum(['executed', 'rejected']),
      mutation: z.enum(['set_alert', 'log_journal', 'share_snapshot', 'run_system_action']),
      resultId: z.string().nullable(),
      url: z.string().nullable(),
      summary: z.string(),
    })
    .optional(),
});
export type MutationConfirmResult = z.infer<typeof MutationConfirmResultSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  TextStartEventSchema,
  TextDeltaEventSchema,
  TextEndEventSchema,
  MultiAgentMetaEventSchema,
  AgentProgressEventSchema,
  ErrorEventSchema,
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
