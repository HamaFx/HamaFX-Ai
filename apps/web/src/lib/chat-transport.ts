'use client';

/**
 * Copyright 2026 HamaFX
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

// Unified AI SDK v5 chat transport.
//
// Wraps DefaultChatTransport and smooths over the three backend modes:
//   1. single-agent / quick / standard  -> AI SDK data stream (passthrough)
//   2. legacy multi-agent SSE           -> converted to AI SDK data stream
//   3. full-mode background job         -> JSON queued response is intercepted,
//      polled, and synthesized into a normal text stream.
//
// The UI only sees one `useChat` with status/messages/stop.

import {
  DefaultChatTransport,
  type UIMessage,
  type PrepareSendMessagesRequest,
  type HttpChatTransportInitOptions,
} from 'ai';
import {
  AnalysisQueuedEventSchema,
  ChatStreamEventSchema,
} from '@hamafx/shared';
import { getCsrfToken } from '@/lib/csrf';

/** Shape emitted by the server for agent deliberation progress. */
export interface AgentProgress {
  agents: Array<{
    agentName: string;
    status: 'pending' | 'running' | 'done' | 'error';
    opinion?: { agentName: string; bias: 'bullish' | 'bearish' | 'neutral'; confidence: number; reasoning: string };
    error?: string;
  }>;
  mode: string;
}

export interface HamaFxChatTransportOptions {
  api?: string;
  headers?: Record<string, string> | Headers;
  body?: object;
  prepareSendMessagesRequest?: PrepareSendMessagesRequest<UIMessage>;
  onAgentProgress?: (progress: AgentProgress | null) => void;
}

const encoder = new TextEncoder();

function encodeChunk(chunk: object): Uint8Array {
  return encoder.encode(`${JSON.stringify(chunk)}\n`);
}

function getContentType(res: Response): string {
  return res.headers.get('content-type')?.toLowerCase() ?? '';
}

/** Minimal SSE-to-AI-SDK-data-stream converter. */
function transformSseToDataStream(res: Response, onProgress: (p: AgentProgress | null) => void): Response {
  const id = crypto.randomUUID();
  let started = false;
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!res.body) {
        controller.close();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const flush = () => {
        if (pendingFlush) {
          clearTimeout(pendingFlush);
          pendingFlush = null;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            let parsed: Record<string, unknown> | undefined;
            try {
              parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              continue;
            }
            if (!parsed) continue;

            const streamEvent = ChatStreamEventSchema.safeParse(parsed);
            if (!streamEvent.success) {
              // Unknown / malformed event — don't crash the stream.
              continue;
            }
            const event = streamEvent.data;

            switch (event.type) {
              case 'text-start': {
                started = true;
                controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
                break;
              }
              case 'text-delta': {
                if (!started) {
                  started = true;
                  controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
                }
                controller.enqueue(encodeChunk({ type: 'text-delta', id: event.id, delta: event.delta }));
                break;
              }
              case 'text-end': {
                started = true;
                controller.enqueue(encodeChunk({ type: 'text-end', id: event.id }));
                break;
              }
              case 'data-multi-agent-meta': {
                controller.enqueue(
                  encodeChunk({
                    type: 'data',
                    id: event.id,
                    data: event.data,
                    transient: event.transient,
                  }),
                );
                break;
              }
              case 'data-agent-progress': {
                const progress = (event.data ?? event) as AgentProgress;
                onProgress(progress);
                controller.enqueue(
                  encodeChunk({ type: 'data-agent-progress', id, data: progress, transient: true }),
                );
                break;
              }
              case 'error': {
                controller.enqueue(encodeChunk({ type: 'error', errorText: event.errorText }));
                break;
              }
            }
            // metadata and [DONE] are intentionally ignored on the legacy SSE path.
          }
        }
      } catch {
        // Reader cancelled (e.g. stop pressed) — close quietly.
      } finally {
        flush();
        if (started) {
          controller.enqueue(encodeChunk({ type: 'text-end', id }));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/** Poll a background analysis job and synthesize an AI SDK data stream. */
function pollJobToStreamResponse(
  jobId: string,
  abortSignal: AbortSignal | undefined,
  onProgress: (p: AgentProgress | null) => void,
): Response {
  const id = jobId;
  const MIN_POLL_MS = 2_000;
  const MAX_POLL_MS = 10_000;
  const MAX_POLL_TIME_MS = 5 * 60_000;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startPoll = Date.now();
      let pollIntervalMs = MIN_POLL_MS;
      let hasError = false;
      let closed = false;

      const closeOnce = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const abortHandler = () => closeOnce();
      abortSignal?.addEventListener('abort', abortHandler);

      try {
        while (Date.now() - startPoll < MAX_POLL_TIME_MS) {
          if (abortSignal?.aborted) return;

          await new Promise((r) => setTimeout(r, pollIntervalMs));
          if (abortSignal?.aborted) return;

          let pollRes: Response | undefined;
          try {
            const requestInit: RequestInit = {
              headers: { 'X-CSRF-Token': getCsrfToken() ?? '' },
            };
            if (abortSignal) requestInit.signal = abortSignal;
            pollRes = await fetch(`/api/chat/analysis-jobs/${jobId}`, requestInit);
          } catch {
            // Network error — backoff and retry.
          }

          if (!pollRes?.ok) {
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }

          let pollJson: {
            status?: string;
            progress?: Array<Record<string, unknown>>;
            result?: { finalText?: string; messageId?: string | null };
            error?: string;
          } = {};
          try {
            pollJson = (await pollRes.json()) as typeof pollJson;
          } catch {
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }

          if (Array.isArray(pollJson.progress) && pollJson.progress.length > 0) {
            const last = pollJson.progress[pollJson.progress.length - 1];
            if (last && last.type === 'data-agent-progress') {
              const progress = (last as unknown as { data: AgentProgress }).data;
              onProgress(progress);
              controller.enqueue(
                encodeChunk({ type: 'data-agent-progress', id, data: progress, transient: true }),
              );
            }
          }

          if (pollJson.status === 'complete' && pollJson.result?.finalText) {
            const finalId = pollJson.result.messageId ?? id;
            controller.enqueue(encodeChunk({ type: 'text-start', id: finalId }));
            controller.enqueue(encodeChunk({ type: 'text-delta', id: finalId, delta: pollJson.result.finalText }));
            controller.enqueue(encodeChunk({ type: 'text-end', id: finalId }));
            onProgress(null);
            return;
          }

          if (pollJson.status === 'failed') {
            hasError = true;
            controller.enqueue(encodeChunk({ type: 'error', errorText: pollJson.error ?? 'Background analysis failed.' }));
            onProgress(null);
            return;
          }

          pollIntervalMs = MIN_POLL_MS;
        }

        if (!hasError) {
          controller.enqueue(encodeChunk({ type: 'error', errorText: 'Background analysis timed out after 5 minutes.' }));
        }
      } finally {
        abortSignal?.removeEventListener('abort', abortHandler);
        closeOnce();
      }
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

/** fetch wrapper that bridges queued jobs and legacy SSE into the AI SDK data stream. */
async function hamaFxFetch(
  onProgress: (p: AgentProgress | null) => void,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await globalThis.fetch(input, init);

  if (!res.ok || !res.body) {
    return res;
  }

  const contentType = getContentType(res);

  if (contentType.includes('application/json')) {
    let json: unknown;
    try {
      json = await res.clone().json();
    } catch {
      return res;
    }

    const queued = AnalysisQueuedEventSchema.safeParse(json);
    if (queued.success) {
      return pollJobToStreamResponse(queued.data.jobId, init?.signal ?? undefined, onProgress);
    }
    // Any other JSON response is not a valid chat stream; let it fail downstream.
    return res;
  }

  if (contentType.includes('text/event-stream')) {
    return transformSseToDataStream(res, onProgress);
  }

  return res;
}

export function createHamaFxChatTransport(options: HamaFxChatTransportOptions): DefaultChatTransport<UIMessage> {
  const onProgress = options.onAgentProgress ?? (() => {});
  const transportOptions: HttpChatTransportInitOptions<UIMessage> = {
    ...(options.api !== undefined && { api: options.api }),
    ...(options.headers !== undefined && { headers: options.headers }),
    ...(options.body !== undefined && { body: options.body }),
    ...(options.prepareSendMessagesRequest !== undefined && {
      prepareSendMessagesRequest: options.prepareSendMessagesRequest,
    }),
    fetch: (input, init) => hamaFxFetch(onProgress, input, init),
  };
  return new DefaultChatTransport<UIMessage>(transportOptions);
}
