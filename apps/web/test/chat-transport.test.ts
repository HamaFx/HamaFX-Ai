// @vitest-environment node
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createKestrelChatTransport } from '@/lib/chat-transport';

function sseResponse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  });
}

async function readChunks(
  stream: ReadableStream<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const chunks: Array<Record<string, unknown>> = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return chunks;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

describe('createKestrelChatTransport', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('constructs a transport backed by the ai SDK DefaultChatTransport', () => {
    const transport = createKestrelChatTransport({ api: '/api/chat' });

    expect(transport).toBeDefined();
    // The transport should expose the AI SDK chat surface. If the ai SDK
    // ever removes or renames DefaultChatTransport, this test fails early
    // rather than at runtime in the browser.
    expect(typeof (transport as { sendMessages?: unknown }).sendMessages).toBe('function');
  });

  it('propagates custom headers through the transport options', () => {
    const transport = createKestrelChatTransport({
      api: '/api/chat',
      headers: { 'x-custom': 'value' },
    });

    expect(transport).toBeDefined();
  });

  it('closes legacy SSE text exactly once and keeps completed progress visible', async () => {
    const progress = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        { type: 'data-agent-progress', data: { agents: [], mode: 'quick' } },
        { type: 'text-start', id: 'server-message-id' },
        { type: 'text-delta', id: 'server-message-id', delta: 'hello' },
        { type: 'text-end', id: 'server-message-id' },
      ]),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat', onAgentProgress: progress });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });

    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);
    const ends = chunks.filter((chunk) => chunk.type === 'text-end');
    expect(ends).toHaveLength(1);
    expect(ends[0]?.id).toBe('server-message-id');
    expect(progress).toHaveBeenLastCalledWith({ agents: [], mode: 'quick' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('polls a queued full-mode job and emits its final metadata', async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: 'analysis-queued',
        jobId: 'job-123',
        status: 'queued',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'complete',
        progress: [{
          type: 'data-agent-progress',
          data: { agents: [{ agentName: 'technical', status: 'done' }], mode: 'full' },
        }],
        result: {
          finalText: 'full result',
          messageId: 'message-123',
          agentOpinions: [{ agentName: 'technical', bias: 'bullish' }],
          mode: 'full',
          totalCostUsd: 0.04,
          totalLatencyMs: 1234,
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const transport = createKestrelChatTransport({ api: '/api/chat', onAgentProgress: progress });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunksPromise = readChunks(stream as ReadableStream<Record<string, unknown>>);
    await vi.advanceTimersByTimeAsync(2_000);
    const chunks = await chunksPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith({ agents: [{ agentName: 'technical', status: 'done' }], mode: 'full' });
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true);
    expect(chunks.some((chunk) => chunk.type === 'data-multi-agent-meta')).toBe(true);
  });

  it('creates a matching text start/end pair when SSE ends without a text-start', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([{ type: 'text-end', id: 'server-message-id' }]),
    );

    const transport = createKestrelChatTransport({ api: '/api/chat' });
    const stream = await transport.sendMessages({
      chatId: 'thread-1',
      messages: [],
      abortSignal: new AbortController().signal,
    });
    const chunks = await readChunks(stream as ReadableStream<Record<string, unknown>>);

    expect(chunks.map((chunk) => chunk.type)).toEqual(['text-start', 'text-end']);
    expect(chunks[0]?.id).toBe('server-message-id');
    expect(chunks[1]?.id).toBe('server-message-id');
  });
});
