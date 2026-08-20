// SPDX-License-Identifier: Apache-2.0

import type { MastraModeResult } from '@kestrel/ai/mastra';
import { ChatStreamEventSchema } from '@kestrel/shared';

function encode(event: unknown): string {
  return `data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`;
}

export function mastraModeResponse(
  input: MastraModeResult & { runId: string; observedCost: number },
): Response {
  const messageId = input.messageId ?? crypto.randomUUID();
  const events = [
    { type: 'text-start', id: messageId },
    { type: 'text-delta', id: messageId, delta: input.finalText },
    { type: 'text-end', id: messageId },
    {
      type: 'data-multi-agent-meta',
      id: messageId,
      data: {
        engine: 'mastra',
        runId: input.runId,
        mode: input.mode,
        symbol: input.symbol,
        packetId: input.packet.packetId,
        dataQuality: input.packet.dataQuality,
        observedCost: input.observedCost,
        totalLatencyMs: input.totalLatencyMs,
        agentOpinions: input.agentOpinions,
      },
    },
  ];

  return new Response(events.map(encode).join(''), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
