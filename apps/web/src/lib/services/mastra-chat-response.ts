// SPDX-License-Identifier: Apache-2.0

import type { XauusdResearchReport } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';

import { createMastraChatMeta, type MastraChatMeta } from '@/lib/mastra-chat-meta';

interface MastraChatResponseInput {
  messageId: string;
  text: string;
  runId: string;
  modelId: string;
  providerId: string;
  report: XauusdResearchReport | null;
  researchStatus: MastraChatMeta['researchStatus'];
  dataQuality: MastraChatMeta['dataQuality'];
  packetId: string;
  observedCost: number;
}

function encodeEvent(event: unknown): string {
  const parsed = ChatStreamEventSchema.parse(event);
  return `data: ${JSON.stringify(parsed)}\n\n`;
}

/**
 * Format a completed Mastra result using the same line-delimited SSE contract
 * consumed by the existing chat transport. The same metadata is also stored
 * as a validated UI part on the assistant message for reload-safe rendering.
 */
export function mastraChatResponse(input: MastraChatResponseInput): Response {
  const meta = createMastraChatMeta({
    runId: input.runId,
    modelId: input.modelId,
    providerId: input.providerId,
    researchStatus: input.researchStatus,
    dataQuality: input.dataQuality,
    packetId: input.packetId,
    observedCost: input.observedCost,
    report: input.report,
  });
  const events = [
    { type: 'text-start', id: input.messageId },
    { type: 'text-delta', id: input.messageId, delta: input.text },
    { type: 'text-end', id: input.messageId },
    {
      type: 'data-multi-agent-meta',
      id: input.messageId,
      // This metadata is part of the user-visible report, not ephemeral
      // progress. Keeping it non-transient lets useChat attach it to the
      // assistant message so the Mastra card renders immediately and remains
      // available after a page reload from persisted history.
      data: meta,
    },
  ];

  return new Response(events.map(encodeEvent).join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
