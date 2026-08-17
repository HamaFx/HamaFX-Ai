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

// Wraps `readUIMessageStream` from the AI SDK so callers can consume an
// `/api/chat` SSE response and pull out the timing, text, and tool-call data
// the eval harness needs without dealing with chunk parsing themselves.

import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

export interface ParsedToolCall {
  /** Tool name extracted from a `tool-<name>` part. */
  name: string;
  /** Tool input (a.k.a. args). `unknown` because this is provider data. */
  args: unknown;
  /** Structured tool output, when the provider emitted one. */
  output?: unknown;
  /**
   * `JSON.stringify(output ?? null).slice(0, 200)` once the tool has emitted
   * an output, or `null` if the tool never produced one (still streaming,
   * errored, etc).
   */
  resultSummary: string | null;
}

export interface ParsedStreamMetadata {
  /** Multi-agent aggregate cost emitted in the transient metadata part. */
  totalCostUsd?: number;
  /** Multi-agent server-side latency emitted in the transient metadata part. */
  totalLatencyMs?: number;
  /** Multi-agent server-side time to first byte/text. */
  ttfbMs?: number | null;
}

export interface AgentProgressEntry {
  agentName: string;
  status: string;
  error?: string;
}

export interface AgentProgressSnapshot {
  mode: string | null;
  agents: AgentProgressEntry[];
  /** Terminal lifecycle state when the producer has reached one. */
  status?: string;
  /** Stable public error for a failed terminal state. */
  error?: string;
}

export interface ParsedStreamResult {
  /** Wall-clock ms from `startedAt` to the first non-empty text part. */
  ttftMs: number | null;
  /** Wall-clock ms from `startedAt` to stream completion. */
  totalMs: number;
  /**
   * Id of the final assistant message as emitted by the server, when the
   * stream produced one. This is the same id persisted in `chat_messages`,
   * which lets the dataset job link an eval case back to real user feedback
   * rows (`ai_message_feedback.message_id`).
   */
  assistantMessageId: string | null;
  /** Concatenated text of every `text` part on the final assistant message. */
  text: string;
  /** One entry per `tool-*` part on the final assistant message. */
  toolCalls: ParsedToolCall[];
  /** Agent lifecycle snapshots emitted by multi-agent streams. */
  agentProgress: AgentProgressSnapshot[];
  /** Stream-level metadata emitted by the server, when present. */
  metadata: ParsedStreamMetadata;
  /**
   * Stream-level errors emitted by the server (e.g. AI Gateway billing /
   * upstream provider failures). Each entry is the verbatim `errorText` from
   * a `type: 'error'` UI-message chunk. Empty when the stream completed
   * cleanly.
   */
  errors: string[];
}

export interface ConsumeUIMessageStreamOptions {
  /**
   * Reference timestamp (ms since epoch) used for `ttftMs` / `totalMs`.
   * Defaults to `Date.now()` at the time of the call.
   */
  startedAt?: number;
}

/**
 * Consume a `Response` whose body is a UI-message SSE stream (the format
 * emitted by `result.toUIMessageStreamResponse()` in the AI SDK v5) and
 * resolve to a structured summary of what was streamed.
 */
export async function consumeUIMessageStream(
  response: Response,
  opts: ConsumeUIMessageStreamOptions = {},
): Promise<ParsedStreamResult> {
  const startedAt = opts.startedAt ?? Date.now();

  if (!response.body) {
    throw new Error('consumeUIMessageStream: response has no body');
  }

  const chunkStream = sseToUIMessageChunkStream(response.body);

  let ttftMs: number | null = null;
  let lastMessage: UIMessage | null = null;
  const errors: string[] = [];
  const agentProgress: AgentProgressSnapshot[] = [];
  const metadata: ParsedStreamMetadata = {};

  // Tee the SSE-decoded chunk stream: one branch feeds `readUIMessageStream`
  // for normal message reconstruction, the other surfaces `type: 'error'`
  // chunks (AI Gateway billing failures, upstream provider errors, etc.) so
  // the eval harness can flag them instead of silently reporting an empty
  // success.
  const [forUiStream, forErrors] = chunkStream.tee();

  const errorReaderPromise = (async () => {
    const reader = forErrors.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        if (value && typeof value === 'object') {
          const chunk = value as {
            type?: unknown;
            errorText?: unknown;
            data?: unknown;
          };
          if (chunk.type === 'error') {
            errors.push(typeof chunk.errorText === 'string' ? chunk.errorText : JSON.stringify(value));
          }
          if (chunk.type === 'data-agent-progress' && isAgentProgressData(chunk.data)) {
            agentProgress.push(chunk.data);
          }
          if (chunk.type === 'data-multi-agent-meta' && isStreamMetadata(chunk.data)) {
            Object.assign(metadata, chunk.data);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  })();

  for await (const message of readUIMessageStream({ stream: forUiStream })) {
    lastMessage = message;
    if (ttftMs === null && hasNonEmptyText(message)) {
      ttftMs = Date.now() - startedAt;
    }
  }
  await errorReaderPromise;

  const totalMs = Date.now() - startedAt;
  const text = lastMessage ? extractText(lastMessage) : '';
  const toolCalls = lastMessage ? extractToolCalls(lastMessage) : [];
  const assistantMessageId = lastMessage && typeof lastMessage.id === 'string' ? lastMessage.id : null;

  return { ttftMs, totalMs, text, toolCalls, agentProgress, metadata, errors, assistantMessageId };
}

// --- helpers ---------------------------------------------------------------

interface TextLikePart {
  type: 'text';
  text: string;
}

function isTextPart(part: UIMessage['parts'][number]): part is TextLikePart {
  return part.type === 'text' && typeof (part as { text?: unknown }).text === 'string';
}

function hasNonEmptyText(message: UIMessage): boolean {
  return message.parts.some((p) => isTextPart(p) && p.text.length > 0);
}

function extractText(message: UIMessage): string {
  return message.parts
    .filter(isTextPart)
    .map((p) => p.text)
    .join('');
}

function isAgentProgressData(value: unknown): value is AgentProgressSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as {
    mode?: unknown;
    agents?: unknown;
    status?: unknown;
    error?: unknown;
  };
  if (typeof data.mode !== 'string' || !Array.isArray(data.agents)) return false;
  if (data.status !== undefined && typeof data.status !== 'string') return false;
  if (data.error !== undefined && typeof data.error !== 'string') return false;
  const agents = data.agents.filter((agent): agent is Record<string, unknown> => typeof agent === 'object' && agent !== null);
  return agents.every((agent) => typeof agent.agentName === 'string' && typeof agent.status === 'string');
}

function isStreamMetadata(value: unknown): value is ParsedStreamMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  return (
    (data.totalCostUsd === undefined || typeof data.totalCostUsd === 'number') &&
    (data.totalLatencyMs === undefined || typeof data.totalLatencyMs === 'number') &&
    (data.ttfbMs === undefined || data.ttfbMs === null || typeof data.ttfbMs === 'number')
  );
}

function extractToolCalls(message: UIMessage): ParsedToolCall[] {
  const out: ParsedToolCall[] = [];

  for (const part of message.parts) {
    if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) {
      continue;
    }

    const p = part as {
      input?: unknown;
      output?: unknown;
      state?: string;
      toolName?: string;
    };

    const name = p.toolName ?? part.type.slice('tool-'.length);
    const hasOutput = p.state === 'output-available';
    const resultSummary = hasOutput ? JSON.stringify(p.output ?? null).slice(0, 200) : null;

    out.push({
      name,
      args: p.input,
      ...(hasOutput ? { output: p.output } : {}),
      resultSummary,
    });
  }

  return out;
}

/**
 * Convert a raw SSE byte stream (the body of a UI-message response) into a
 * `ReadableStream<UIMessageChunk>` that `readUIMessageStream` can consume.
 *
 * Each SSE event has one or more `data: ...` lines; we concatenate them with
 * `\n` (per the SSE spec) and JSON-parse the result. `[DONE]` sentinels and
 * un-parseable lines are skipped silently — callers see the partial state via
 * the iterated UIMessage.
 */
function sseToUIMessageChunkStream(
  body: ReadableStream<Uint8Array>,
): ReadableStream<UIMessageChunk> {
  const decoder = new TextDecoder();
  let buffer = '';

  return body.pipeThrough(
    new TransformStream<Uint8Array, UIMessageChunk>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });

        let separatorIdx = findEventSeparator(buffer);
        while (separatorIdx !== -1) {
          const eventBlock = buffer.slice(0, separatorIdx.start);
          buffer = buffer.slice(separatorIdx.end);
          enqueueEvent(eventBlock, controller);
          separatorIdx = findEventSeparator(buffer);
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer.length > 0) {
          enqueueEvent(buffer, controller);
          buffer = '';
        }
      },
    }),
  );
}

interface EventSeparator {
  start: number;
  end: number;
}

function findEventSeparator(buffer: string): EventSeparator | -1 {
  // The SSE spec terminates events with a blank line, which over the wire is
  // either `\n\n` or `\r\n\r\n`. We accept either.
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');

  if (lf === -1 && crlf === -1) return -1;
  if (lf === -1) return { start: crlf, end: crlf + 4 };
  if (crlf === -1) return { start: lf, end: lf + 2 };
  return lf < crlf ? { start: lf, end: lf + 2 } : { start: crlf, end: crlf + 4 };
}

function enqueueEvent(
  block: string,
  controller: TransformStreamDefaultController<UIMessageChunk>,
): void {
  const dataLines: string[] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith('data:')) {
      // Per the SSE spec, a single optional space after the colon is stripped.
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  }

  if (dataLines.length === 0) return;

  const data = dataLines.join('\n');
  if (data === '' || data === '[DONE]') return;

  try {
    controller.enqueue(JSON.parse(data) as UIMessageChunk);
  } catch {
    // Malformed SSE data line — ignore and keep going.
  }
}
