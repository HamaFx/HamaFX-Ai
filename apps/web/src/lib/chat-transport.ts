'use client';

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

// Unified AI SDK v5 chat transport.
//
// Wraps DefaultChatTransport and smooths over the three backend modes:
//   1. single-agent / quick / standard  -> AI SDK data stream (passthrough)
//   2. legacy multi-agent SSE           -> converted to AI SDK data stream
//   3. full-mode background job          -> JSON queued response is intercepted,
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
  MutationDraftEventSchema,
  type MutationDraftEvent,
} from '@kestrel/shared';
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
  status?: 'complete' | 'failed' | 'retrying';
  error?: string;
}

export interface KestrelChatTransportOptions {
  api?: string;
  headers?: Record<string, string> | Headers;
  body?: object;
  prepareSendMessagesRequest?: PrepareSendMessagesRequest<UIMessage>;
  onAgentProgress?: (progress: AgentProgress | null) => void;
}

const encoder = new TextEncoder();

function encodeChunk(chunk: object): Uint8Array {
  // DefaultChatTransport parses JSON event streams using SSE framing.
  // Keep adapted legacy/job streams on the same wire format as the server's
  // native multi-agent response (`data: <json>\n\n`).
  return encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
}

function getContentType(res: Response): string {
  return res.headers.get('content-type')?.toLowerCase() ?? '';
}

/** Minimal SSE-to-AI-SDK-data-stream converter. */
function transformSseToDataStream(res: Response, onProgress: (p: AgentProgress | null) => void): Response {
  const id = crypto.randomUUID();
  let started = false;
  let ended = false;
  let emittedError = false;
  let protocolError: string | null = null;
  let activeTextId: string | null = null;
  let pendingFlush: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!res.body) {
        controller.enqueue(encodeChunk({ type: 'error', errorText: 'Chat stream returned no response body.' }));
        onProgress(null);
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
              protocolError ??= 'Chat stream contained malformed JSON.';
              continue;
            }
            if (!parsed) {
              protocolError ??= 'Chat stream contained an empty event.';
              continue;
            }

            const streamEvent = ChatStreamEventSchema.safeParse(parsed);
            if (!streamEvent.success) {
              // Do not turn a truncated/unknown event into a successful
              // assistant message. Surface the protocol failure explicitly.
              protocolError ??= 'Chat stream contained an unsupported or malformed event.';
              continue;
            }
            const event = streamEvent.data;

            switch (event.type) {
              case 'text-start': {
                started = true;
                activeTextId = event.id;
                controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
                break;
              }
              case 'text-delta': {
                if (!started) {
                  started = true;
                  activeTextId = event.id;
                  controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
                }
                const textId = activeTextId ?? event.id;
                controller.enqueue(encodeChunk({ type: 'text-delta', id: textId, delta: event.delta }));
                break;
              }
              case 'text-end': {
                const textId = activeTextId ?? event.id;
                if (!started) {
                  started = true;
                  activeTextId = textId;
                  controller.enqueue(encodeChunk({ type: 'text-start', id: textId }));
                }
                controller.enqueue(encodeChunk({ type: 'text-end', id: textId }));
                ended = true;
                break;
              }
              case 'data-multi-agent-meta': {
                controller.enqueue(
                  encodeChunk({
                    type: event.type,
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
                emittedError = true;
                controller.enqueue(encodeChunk({ type: 'error', errorText: event.errorText }));
                break;
              }
            }
          }
        }

        // A well-formed SSE response ends events with a blank line, but
        // flush the decoder and process a final unterminated line as a
        // defensive measure so the last event is not silently dropped.
        buffer += decoder.decode();
        if (buffer.startsWith('data: ')) {
          const raw = buffer.slice(6).trim();
          if (raw && raw !== '[DONE]') {
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              const streamEvent = ChatStreamEventSchema.safeParse(parsed);
              if (!streamEvent.success) {
                protocolError ??= 'Chat stream ended with a malformed event.';
              } else {
                const event = streamEvent.data;
                if (event.type === 'text-end') {
                  const textId = activeTextId ?? event.id;
                  if (!started) {
                    started = true;
                    activeTextId = textId;
                    controller.enqueue(encodeChunk({ type: 'text-start', id: textId }));
                  }
                  controller.enqueue(encodeChunk({ type: 'text-end', id: textId }));
                  ended = true;
                } else if (event.type === 'text-start') {
                  started = true;
                  activeTextId = event.id;
                  controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
                } else if (event.type === 'text-delta') {
                  if (!started) {
                    started = true;
                    activeTextId = event.id;
                    controller.enqueue(encodeChunk({ type: 'text-start', id: event.id }));
                  }
                  controller.enqueue(encodeChunk({ type: 'text-delta', id: activeTextId ?? event.id, delta: event.delta }));
                } else if (event.type === 'data-agent-progress') {
                  const progress = (event.data ?? event) as AgentProgress;
                  onProgress(progress);
                  controller.enqueue(encodeChunk({ type: 'data-agent-progress', id, data: progress, transient: true }));
                } else if (event.type === 'data-multi-agent-meta') {
                  controller.enqueue(encodeChunk({ type: event.type, id: event.id, data: event.data, transient: event.transient }));
                } else if (event.type === 'error') {
                  emittedError = true;
                  controller.enqueue(encodeChunk({ type: 'error', errorText: event.errorText }));
                }
              }
            } catch {
              protocolError ??= 'Chat stream ended with malformed JSON.';
            }
          }
        }
      } catch (err) {
        // Reader cancellation is still a terminal condition. Preserve the
        // user's explicit stop as a quiet close, but surface other reader
        // failures instead of presenting truncated text as complete.
        protocolError ??= err instanceof Error ? err.message : String(err);
      } finally {
        flush();
        if (protocolError && !emittedError) {
          controller.enqueue(encodeChunk({ type: 'error', errorText: protocolError }));
        }
        if (started && !ended) {
          controller.enqueue(encodeChunk({ type: 'text-end', id: activeTextId ?? id }));
        }
        // Keep the terminal committee state visible after both success and
        // failure. A subsequent turn replaces it with a fresh snapshot.
        if (!ended && !emittedError && !protocolError) onProgress(null);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
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
      let consecutivePollFailures = 0;
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
            // Network error — backoff and retry, but do not hide a persistent
            // transport failure behind the five-minute timeout.
            consecutivePollFailures += 1;
            if (consecutivePollFailures >= 3) {
              hasError = true;
              controller.enqueue(encodeChunk({ type: 'error', errorText: 'Unable to reach the background analysis worker.' }));
              return;
            }
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }

          if (!pollRes?.ok) {
            consecutivePollFailures += 1;
            if (pollRes?.status === 404 || consecutivePollFailures >= 3) {
              hasError = true;
              controller.enqueue(encodeChunk({ type: 'error', errorText: pollRes?.status === 404 ? 'Background analysis job was not found.' : 'Unable to poll the background analysis worker.' }));
              return;
            }
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }
          consecutivePollFailures = 0;

          let pollJson: {
            status?: string;
            progress?: Array<Record<string, unknown>>;
            result?: {
              finalText?: string;
              messageId?: string | null;
              agentOpinions?: unknown[];
              mode?: string;
              totalCostUsd?: number;
              totalLatencyMs?: number;
            };
            error?: string;
          } = {};
          try {
            pollJson = (await pollRes.json()) as typeof pollJson;
          } catch {
            consecutivePollFailures += 1;
            if (consecutivePollFailures >= 3) {
              hasError = true;
              controller.enqueue(encodeChunk({ type: 'error', errorText: 'Background analysis returned invalid status data.' }));
              return;
            }
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

          if (pollJson.status === 'complete') {
            const finalId = pollJson.result?.messageId ?? id;
            const finalText = pollJson.result?.finalText ?? '';
            controller.enqueue(encodeChunk({ type: 'text-start', id: finalId }));
            if (finalText) {
              controller.enqueue(encodeChunk({ type: 'text-delta', id: finalId, delta: finalText }));
            }
            controller.enqueue(encodeChunk({ type: 'text-end', id: finalId }));
            controller.enqueue(
              encodeChunk({
                type: 'data-multi-agent-meta',
                id: finalId,
                data: {
                  agentOpinions: pollJson.result?.agentOpinions ?? [],
                  mode: pollJson.result?.mode ?? 'full',
                  totalCostUsd: pollJson.result?.totalCostUsd ?? 0,
                  totalLatencyMs: pollJson.result?.totalLatencyMs ?? 0,
                  messageId: finalId,
                },
                transient: true,
              }),
            );
            return;
          }

          if (pollJson.status === 'failed') {
            hasError = true;
            controller.enqueue(encodeChunk({
              type: 'error',
              errorText: pollJson.error ?? 'Full analysis could not be completed. No partial answer was returned.',
            }));
            // Keep the terminal failed-agent snapshot visible. Clearing it here
            // made the UI appear to reset immediately after showing progress.
            return;
          }

          if (pollJson.status !== 'pending' && pollJson.status !== 'running') {
            hasError = true;
            controller.enqueue(encodeChunk({ type: 'error', errorText: 'Background analysis returned an unknown job status.' }));
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

  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

/**
 * Synthesize an AI SDK data stream for a mutation draft: an assistant
 * message whose only part is the confirmation card (`data-mutation-
 * confirmation`). The card owns the confirm/resume round-trip, so the
 * stream carries no text.
 */
function mutationDraftToStreamResponse(draft: MutationDraftEvent): Response {
  const id = crypto.randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeChunk({ type: 'text-start', id }));
      controller.enqueue(encodeChunk({
        type: 'data-mutation-confirmation',
        id,
        data: draft.payload,
      }));
      controller.enqueue(encodeChunk({ type: 'text-end', id }));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
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
    const draft = MutationDraftEventSchema.safeParse(json);
    if (draft.success) {
      return mutationDraftToStreamResponse(draft.data);
    }
    // Any other JSON response is not a valid chat stream; let it fail downstream.
    return res;
  }

  if (contentType.includes('text/event-stream')) {
    return transformSseToDataStream(res, onProgress);
  }

  return res;
}

export function createKestrelChatTransport(options: KestrelChatTransportOptions): DefaultChatTransport<UIMessage> {
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
