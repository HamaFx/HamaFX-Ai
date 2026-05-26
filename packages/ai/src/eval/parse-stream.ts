// Wraps `readUIMessageStream` from the AI SDK so callers can consume an
// `/api/chat` SSE response and pull out the timing, text, and tool-call data
// the eval harness needs without dealing with chunk parsing themselves.

import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

export interface ParsedToolCall {
  /** Tool name extracted from a `tool-<name>` part. */
  name: string;
  /** Tool input (a.k.a. args). `unknown` because this is provider data. */
  args: unknown;
  /**
   * `JSON.stringify(output ?? null).slice(0, 200)` once the tool has emitted
   * an output, or `null` if the tool never produced one (still streaming,
   * errored, etc).
   */
  resultSummary: string | null;
}

export interface ParsedStreamResult {
  /** Wall-clock ms from `startedAt` to the first non-empty text part. */
  ttftMs: number | null;
  /** Wall-clock ms from `startedAt` to stream completion. */
  totalMs: number;
  /** Concatenated text of every `text` part on the final assistant message. */
  text: string;
  /** One entry per `tool-*` part on the final assistant message. */
  toolCalls: ParsedToolCall[];
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

  for await (const message of readUIMessageStream({ stream: chunkStream })) {
    lastMessage = message;
    if (ttftMs === null && hasNonEmptyText(message)) {
      ttftMs = Date.now() - startedAt;
    }
  }

  const totalMs = Date.now() - startedAt;
  const text = lastMessage ? extractText(lastMessage) : '';
  const toolCalls = lastMessage ? extractToolCalls(lastMessage) : [];

  return { ttftMs, totalMs, text, toolCalls };
}

// --- helpers ---------------------------------------------------------------

interface TextLikePart {
  type: 'text';
  text: string;
}

function isTextPart(part: UIMessage['parts'][number]): part is TextLikePart {
  return (
    part.type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
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

function extractToolCalls(message: UIMessage): ParsedToolCall[] {
  const out: ParsedToolCall[] = [];

  for (const part of message.parts) {
    if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) {
      continue;
    }

    const name = part.type.slice('tool-'.length);
    const p = part as {
      input?: unknown;
      output?: unknown;
      state?: string;
    };

    const resultSummary =
      p.state === 'output-available'
        ? JSON.stringify(p.output ?? null).slice(0, 200)
        : null;

    out.push({ name, args: p.input, resultSummary });
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
