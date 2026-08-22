// SPDX-License-Identifier: Apache-2.0

import { ChatStreamEventSchema } from '@kestrel/shared';

export interface MastraStreamResponseMeta {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

export interface MastraStreamResponseOptions {
  readonly meta?: MastraStreamResponseMeta;
  readonly signal?: AbortSignal;
  /**
   * Called when the stream is aborted before completion (client disconnect
   * or upstream error). This is the hook for the service layer to persist
   * an "interrupted" assistant marker so the orphaned user message has
   * context when the user retries. The callback must not throw — failures
   * are swallowed so the stream can close cleanly.
   */
  readonly onAbort?: () => void | Promise<void>;
}

function encode(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ChatStreamEventSchema.parse(event))}\n\n`);
}

/**
 * Adapt an async text iterable into the chat SSE contract. The iterable is
 * consumed lazily, so the first provider chunk can reach the browser without
 * waiting for the full answer.
 */
export function mastraStreamResponse(
  text: AsyncIterable<string>,
  messageId: string,
  options: MastraStreamResponseOptions = {},
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let started = false;
      let ended = false;
      try {
        if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
        controller.enqueue(encode({ type: 'text-start', id: messageId }));
        started = true;
        for await (const chunk of text) {
          if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
          if (chunk) controller.enqueue(encode({ type: 'text-delta', id: messageId, delta: chunk }));
        }
        if (options.meta) {
          controller.enqueue(encode({ type: 'data-multi-agent-meta', id: options.meta.id, data: options.meta.data }));
        }
        controller.enqueue(encode({ type: 'text-end', id: messageId }));
        ended = true;
      } catch (error) {
        if (!options.signal?.aborted) {
          controller.enqueue(encode({
            type: 'error',
            errorText: error instanceof Error ? error.message : 'Mastra stream failed.',
          }));
        }
        // When the stream is aborted before completion, fire the onAbort
        // callback so the service layer can persist an interrupted marker.
        if (started && !ended && options.onAbort) {
          try {
            await options.onAbort();
          } catch {
            // Swallow — the stream must close cleanly regardless.
          }
        }
      } finally {
        if (started && !ended) controller.enqueue(encode({ type: 'text-end', id: messageId }));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
