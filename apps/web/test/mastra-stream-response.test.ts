// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { mastraStreamResponse } from '@/lib/services/mastra-stream-response';

describe('mastraStreamResponse onAbort', () => {
  it('calls onAbort when the stream is aborted before completion', async () => {
    const onAbort = vi.fn();
    const controller = new AbortController();

    // An async iterable that yields one chunk, then waits for abort.
    async function* text(): AsyncIterable<string> {
      yield 'partial';
      // Wait for the abort signal, then throw.
      await new Promise<void>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError'));
        });
      });
    }

    const response = mastraStreamResponse(text(), 'msg-1', {
      signal: controller.signal,
      onAbort,
    });

    // Abort after a short delay so the first chunk can be yielded.
    setTimeout(() => controller.abort(), 20);

    // Drain the stream.
    const reader = response.body!.getReader();
    try {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      // Errors are expected on abort.
    }

    // Give the async onAbort callback time to fire.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('does not call onAbort when the stream completes normally', async () => {
    const onAbort = vi.fn();

    async function* text(): AsyncIterable<string> {
      yield 'hello';
      yield ' world';
    }

    const response = mastraStreamResponse(text(), 'msg-2', {
      onAbort,
    });

    const reader = response.body!.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onAbort).not.toHaveBeenCalled();
  });
});
