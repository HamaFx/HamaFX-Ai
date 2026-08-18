// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { mastraChatResponse } from '@/lib/services/mastra-chat-response';

describe('mastraChatResponse', () => {
  it('emits non-transient report metadata for immediate and reload-safe rendering', async () => {
    const response = mastraChatResponse({
      messageId: 'message-1',
      text: 'Grounded gold analysis',
      runId: 'run-1',
      modelId: 'mistral-small-latest',
      providerId: 'mistral',
      researchStatus: 'ready',
      dataQuality: 'partial',
      packetId: 'packet-1',
      observedCost: 0.001,
      report: null,
    });

    const body = await response.text();
    const events = body
      .trim()
      .split('\n\n')
      .map((chunk) => JSON.parse(chunk.replace(/^data: /, '')) as Record<string, unknown>);
    const metadata = events.find((event) => event.type === 'data-multi-agent-meta');

    expect(metadata).toMatchObject({
      type: 'data-multi-agent-meta',
      id: 'message-1',
      data: {
        agent: 'mastra-xauusd',
        runId: 'run-1',
      },
    });
    expect(metadata).not.toHaveProperty('transient', true);
  });
});
