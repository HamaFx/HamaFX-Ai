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
  // Intentionally id-less: the tracker lives in @hamafx/ai and does not
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

export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  TextStartEventSchema,
  TextDeltaEventSchema,
  TextEndEventSchema,
  MultiAgentMetaEventSchema,
  AgentProgressEventSchema,
  ErrorEventSchema,
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
