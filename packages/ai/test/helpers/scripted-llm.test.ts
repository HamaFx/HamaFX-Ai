import { describe, expect, it, vi } from 'vitest';

import {
  createScriptedLlmClient,
  scriptedModel,
} from './scripted-llm';

describe('ScriptedLlmClient', () => {
  it('returns deterministic text and usage data', async () => {
    const scripted = createScriptedLlmClient([
      { type: 'text', text: 'fixed response', inputTokens: 4, outputTokens: 2 },
    ]);

    const result = await scripted.client.generateText({
      model: scriptedModel(),
      prompt: 'hello',
    });

    expect(result).toEqual({
      text: 'fixed response',
      usage: { inputTokens: 4, outputTokens: 2 },
    });
    expect(scripted.remainingScenarios()).toBe(0);
  });

  it('executes a scripted tool call and exposes the tool result in onFinish', async () => {
    const execute = vi.fn().mockResolvedValue({ ticks: [{ symbol: 'XAUUSD', mid: 2400 }] });
    const onFinish = vi.fn();
    const scripted = createScriptedLlmClient([
      {
        type: 'tool',
        toolName: 'get_price',
        input: { symbols: ['XAUUSD'] },
        text: 'Price checked.',
      },
    ]);

    await scripted.client.streamText({
      model: scriptedModel(),
      tools: { get_price: { execute } },
      onFinish,
    });

    expect(execute).toHaveBeenCalledWith(
      { symbols: ['XAUUSD'] },
      expect.objectContaining({ toolCallId: 'scripted-call-get_price' }),
    );
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({
      finishReason: 'stop',
      response: expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'tool' }),
        ]),
      }),
    }));
  });

  it('propagates scripted provider failures without consuming later scenarios', async () => {
    const failure = new Error('provider unavailable');
    const scripted = createScriptedLlmClient([
      { type: 'error', error: failure },
      { type: 'text', text: 'fallback response' },
    ]);

    await expect(scripted.client.streamText({ model: scriptedModel() })).rejects.toBe(failure);
    expect(scripted.remainingScenarios()).toBe(1);
  });
});
