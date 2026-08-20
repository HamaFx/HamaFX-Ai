// SPDX-License-Identifier: Apache-2.0

import type { MastraCanonicalChatResult } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';

export function mastraCanonicalResponse(
  input: MastraCanonicalChatResult & {
    runId: string;
    observedCost: number;
    messageId: string;
  },
): Response {
  const messageId = input.messageId || crypto.randomUUID();
  const events = [
    { type: 'text-start', id: messageId },
    { type: 'text-delta', id: messageId, delta: input.text },
    { type: 'text-end', id: messageId },
    {
      type: 'data-multi-agent-meta',
      id: messageId,
      data: {
        engine: 'mastra',
        canonical: true,
        runId: input.runId,
        routingDomain: input.routing.domain,
        modelId: input.modelId,
        providerId: input.providerId,
        observedCost: input.observedCost,
        totalLatencyMs: input.totalLatencyMs,
        toolNames: input.toolNames,
      },
    },
  ];
  return new Response(
    events
      .map((event) => `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`)
      .join(''),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
}
