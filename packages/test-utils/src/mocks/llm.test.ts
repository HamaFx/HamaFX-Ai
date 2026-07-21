import { describe, expect, it } from 'vitest';
import { createMockLlm } from './llm';

describe('createMockLlm', () => {
  it('returns a default response when no responses are configured', async () => {
    const mock = createMockLlm();
    const result = await mock.generateText({ prompt: 'hello' });
    expect(result.text).toBe('Mock response');
    expect(result.finishReason).toBe('stop');
  });

  it('returns configured responses in sequence', async () => {
    const mock = createMockLlm();
    mock.addResponse({ content: 'First' });
    mock.addResponse({ content: 'Second' });

    const r1 = await mock.generateText({ prompt: 'a' });
    const r2 = await mock.generateText({ prompt: 'b' });

    expect(r1.text).toBe('First');
    expect(r2.text).toBe('Second');
  });

  it('repeats the last response when exhausted', async () => {
    const mock = createMockLlm();
    mock.addResponse({ content: 'Only' });

    expect((await mock.generateText({ prompt: 'a' })).text).toBe('Only');
    expect((await mock.generateText({ prompt: 'b' })).text).toBe('Only');
    expect((await mock.generateText({ prompt: 'c' })).text).toBe('Only');
  });

  it('tracks call count', async () => {
    const mock = createMockLlm();
    expect(mock.callCount).toBe(0);

    await mock.generateText({ prompt: 'a' });
    expect(mock.callCount).toBe(1);

    await mock.generateText({ prompt: 'b' });
    expect(mock.callCount).toBe(2);
  });

  it('clear() resets responses and call count', async () => {
    const mock = createMockLlm();
    mock.addResponse({ content: 'x' });
    await mock.generateText({ prompt: 'a' });
    expect(mock.callCount).toBe(1);

    mock.clear();
    expect(mock.callCount).toBe(0);
    const result = await mock.generateText({ prompt: 'b' });
    expect(result.text).toBe('Mock response'); // back to default
  });

  it('addResponses adds multiple responses at once', async () => {
    const mock = createMockLlm();
    mock.addResponses([{ content: 'A' }, { content: 'B' }, { content: 'C' }]);

    expect((await mock.generateText({ prompt: '1' })).text).toBe('A');
    expect((await mock.generateText({ prompt: '2' })).text).toBe('B');
    expect((await mock.generateText({ prompt: '3' })).text).toBe('C');
  });

  it('setResponses replaces all responses and resets call count', async () => {
    const mock = createMockLlm();
    mock.addResponse({ content: 'old' });
    await mock.generateText({ prompt: 'a' });

    mock.setResponses([{ content: 'new' }]);
    expect(mock.callCount).toBe(0);
    expect((await mock.generateText({ prompt: 'b' })).text).toBe('new');
  });

  it('includes tool calls in generateText output', async () => {
    const mock = createMockLlm();
    mock.addResponse({
      content: 'Using tool',
      toolCalls: [{ name: 'get_price', args: { symbol: 'XAUUSD' } }],
      finishReason: 'tool-calls',
    });

    const result = await mock.generateText({ prompt: 'check price' });
    expect(result.text).toBe('Using tool');
    expect(result.finishReason).toBe('tool-calls');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls![0]!.toolName).toBe('get_price');
    expect(result.toolCalls![0]!.args).toEqual({ symbol: 'XAUUSD' });
  });

  describe('streamText', () => {
    it('returns a readable stream with the response content', async () => {
      const mock = createMockLlm();
      mock.addResponse({ content: 'Hello streaming' });

      const { textStream, text, finishReason } = await mock.streamText({ prompt: 'hi' });

      // Consume the stream
      const reader = textStream.getReader();
      const chunks: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      expect(chunks.join('')).toBe('Hello streaming');
      expect(await text).toBe('Hello streaming');
      expect(await finishReason).toBe('stop');
    });

    it('streams a default response when none configured', async () => {
      const mock = createMockLlm();
      const { text } = await mock.streamText({ prompt: 'hi' });
      expect(await text).toBe('Mock response');
    });

    it('respects finishReason in streaming', async () => {
      const mock = createMockLlm();
      mock.addResponse({ content: 'Done', finishReason: 'tool-calls' });
      const { finishReason } = await mock.streamText({ prompt: 'hi' });
      expect(await finishReason).toBe('tool-calls');
    });
  });
});
