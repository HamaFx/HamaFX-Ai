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

// PF-07 — LlmClient abstraction over the Vercel AI SDK.
//
// The interface isolates the rest of the codebase from direct coupling
// to `ai` package APIs (`generateText`, `streamText`). Swapping the
// underlying SDK (e.g. for LangChain, a custom HTTP client, or a test
// double) requires only a new `LlmClient` implementation.
//
// For now, the primary consumer (`agent.ts`) is migrated as proof of
// concept. Other callers (planner, title, verification, etc.) can be
// migrated incrementally.

import {
  generateText as aiGenerateText,
  streamText as aiStreamText,
  type LanguageModel,
} from 'ai';

// ── Abstractions ───────────────────────────────────────────────────────────

/** Options for a generateText call. */
export interface GenerateTextOpts {
  model: LanguageModel;
  system?: string;
  messages?: readonly { role: string; content: string }[];
  prompt?: string;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  telemetry?: Record<string, unknown>;
}

/** Result of a generateText call. */
export interface GenerateTextResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Options for a streamText call. */
export interface StreamTextOpts {
  model: LanguageModel;
  system?: string;
  messages?: readonly unknown[];
  tools?: Record<string, unknown>;
  stopWhen?: (step: { stepCount: number }) => boolean;
  abortSignal?: AbortSignal;
  telemetry?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
  onFinish?: (event: {
    usage?: { inputTokens: number; outputTokens: number };
    finishReason: string;
    response: { messages: readonly unknown[]; headers?: Record<string, string> };
  }) => Promise<void> | void;
}

/** Result of a streamText call. */
export interface StreamTextResult {
  /** Pipe to the HTTP response. */
  toUIMessageStreamResponse: () => Response;
  /** Full text output — resolves when the stream completes. */
  text: Promise<string>;
}

/**
 * PF-07 — Contract for LLM text generation and streaming.
 *
 * Implementations wrap a specific SDK (Vercel AI, LangChain, custom HTTP).
 */
export interface LlmClient {
  generateText(opts: GenerateTextOpts): Promise<GenerateTextResult>;
  streamText(opts: StreamTextOpts): Promise<StreamTextResult>;
}

// ── Vercel AI SDK implementation ───────────────────────────────────────────

/**
 * Default implementation that delegates to the Vercel AI SDK's
 * `generateText` and `streamText`.
 */
export class VercelLlmClient implements LlmClient {
  async generateText(opts: GenerateTextOpts): Promise<GenerateTextResult> {
    const callArgs: Record<string, unknown> = { model: opts.model };
    if (opts.system) callArgs.system = opts.system;
    if (opts.messages) callArgs.messages = opts.messages;
    if (opts.prompt) callArgs.prompt = opts.prompt;
    if (opts.maxOutputTokens) callArgs.maxOutputTokens = opts.maxOutputTokens;
    if (opts.abortSignal) callArgs.abortSignal = opts.abortSignal;
    if (opts.telemetry) Object.assign(callArgs, opts.telemetry);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (aiGenerateText as any)(callArgs);
    const raw = result as { text: string; usage?: { promptTokens?: number; completionTokens?: number } };
    return {
      text: raw.text,
      ...(raw.usage
        ? { usage: { inputTokens: raw.usage.promptTokens ?? 0, outputTokens: raw.usage.completionTokens ?? 0 } }
        : {}),
    };
  }

  async streamText(opts: StreamTextOpts): Promise<StreamTextResult> {
    const callArgs: Record<string, unknown> = { model: opts.model };
    if (opts.system) callArgs.system = opts.system;
    if (opts.messages) callArgs.messages = opts.messages;
    if (opts.tools) callArgs.tools = opts.tools;
    if (opts.stopWhen) callArgs.stopWhen = opts.stopWhen;
    if (opts.abortSignal) callArgs.abortSignal = opts.abortSignal;
    if (opts.telemetry) Object.assign(callArgs, opts.telemetry);
    if (opts.providerOptions) callArgs.providerOptions = opts.providerOptions;
    if (opts.onFinish) callArgs.onFinish = opts.onFinish;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (aiStreamText as any)(callArgs);
    const sdk = result as { toDataStreamResponse: () => Response; text: Promise<string> };
    return {
      toUIMessageStreamResponse: () => sdk.toDataStreamResponse() as Response,
      text: sdk.text,
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

let _defaultClient: LlmClient | null = null;

/**
 * Get the default LlmClient (a singleton VercelLlmClient).
 * Override via `setLlmClient` (e.g. in tests).
 */
export function getLlmClient(): LlmClient {
  if (!_defaultClient) {
    _defaultClient = new VercelLlmClient();
  }
  return _defaultClient;
}

/**
 * Replace the default client. Useful for tests or switching to a
 * different SDK. Pass `null` to reset to the default.
 */
export function setLlmClient(client: LlmClient | null): void {
  _defaultClient = client;
}
