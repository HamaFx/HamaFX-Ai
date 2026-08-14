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

// Shared helpers for BYOK provider definitions. Imported by individual provider
// spec files to keep them focused on data declarations.

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import type { ByokProviderSpec, ModelDomain } from './types';

/** A normalized OpenAI-compatible tool call extracted from HCNSEC output. */
export interface HcnsecToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Parse DeepSeek's DSML tool-call format when HCNSEC returns it as text.
 *
 * Some HCNSEC/DeepSeek responses use:
 * `<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="get_price">...`
 * instead of OpenAI-compatible `message.tool_calls`. Converting it at
 * the provider boundary lets the AI SDK execute the registered tools and
 * keeps the rest of the agent pipeline provider-agnostic.
 */
export function normalizeHcnsecDsmlToolCalls(input: string): {
  content: string;
  toolCalls: HcnsecToolCall[];
} | null {
  const dsml = '｜｜DSML｜｜';
  const startTag = `<${dsml}tool_calls>`;
  const endTag = `</${dsml}tool_calls>`;
  const start = input.indexOf(startTag);
  if (start < 0) return null;
  const end = input.indexOf(endTag, start + startTag.length);
  if (end < 0) return null;

  const body = input.slice(start + startTag.length, end);
  const invokePattern = new RegExp(
    `<${dsml}invoke\\s+name="([^"]+)"\\s*>([\\s\\S]*?)</${dsml}invoke>`,
    'g',
  );
  const parameterPattern = new RegExp(
    `<${dsml}parameter\\s+name="([^"]+)"(?:\\s+string="([^"]+)")?\\s*>([\\s\\S]*?)</${dsml}parameter>`,
    'g',
  );
  const toolCalls: HcnsecToolCall[] = [];
  let invoke: RegExpExecArray | null;
  while ((invoke = invokePattern.exec(body)) !== null) {
    const name = invoke[1]?.trim();
    if (!name) continue;
    const args: Record<string, unknown> = {};
    const parameters = invoke[2] ?? '';
    let parameter: RegExpExecArray | null;
    while ((parameter = parameterPattern.exec(parameters)) !== null) {
      const key = parameter[1]?.trim();
      if (!key) continue;
      const rawValue = (parameter[3] ?? '').trim();
      const isString = parameter[2] === 'true';
      if (isString) {
        args[key] = rawValue;
      } else {
        try {
          args[key] = JSON.parse(rawValue) as unknown;
        } catch {
          args[key] = rawValue;
        }
      }
    }
    toolCalls.push({
      id: `hcnsec-dsml-${toolCalls.length}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
  }

  if (toolCalls.length === 0) return null;
  const content = `${input.slice(0, start)}${input.slice(end + endTag.length)}`.trim();
  return { content, toolCalls };
}

/** Normalize a non-streaming HCNSEC chat-completion payload. */
export function normalizeHcnsecJsonPayload(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const payload = input as Record<string, unknown>;
  if (!Array.isArray(payload.choices)) return input;
  const choices = payload.choices as unknown[];
  let changed = false;
  const normalizedChoices = choices.map((rawChoice) => {
    if (!rawChoice || typeof rawChoice !== 'object') return rawChoice;
    const choice = rawChoice as Record<string, unknown>;
    const message = choice.message;
    if (!message || typeof message !== 'object') return rawChoice;
    const messageRecord = message as Record<string, unknown>;
    if (typeof messageRecord.content !== 'string') return rawChoice;
    const normalized = normalizeHcnsecDsmlToolCalls(messageRecord.content);
    if (!normalized) return rawChoice;
    changed = true;
    return {
      ...choice,
      finish_reason: 'tool_calls',
      message: {
        ...messageRecord,
        content: normalized.content || null,
        tool_calls: normalized.toolCalls,
      },
    };
  });
  return changed ? { ...payload, choices: normalizedChoices } : input;
}

/**
 * HCNSEC occasionally emits tool-call metadata in separate SSE chunks
 * (the name/ID may arrive after the first arguments chunk). The AI SDK's
 * OpenAI-compatible parser requires the name and ID on the first chunk.
 * This normalizer combines one HCNSEC tool response into one canonical SSE
 * event before the SDK parses it. It is intentionally provider-specific.
 */
export function normalizeHcnsecSse(input: string): string {
  const events = input
    .split(/\r?\n\r?\n/)
    .map((event) => event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n'))
    .filter((data) => data.length > 0 && data !== '[DONE]');

  const chunks: Array<Record<string, unknown>> = [];
  for (const data of events) {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (!('choices' in parsed) && !('usage' in parsed)) continue;
      chunks.push(parsed);
    } catch {
      // Ignore provider keep-alive/comment events and malformed telemetry.
    }
  }

  // If the gateway returned an unrecognized stream, preserve it for the
  // SDK's own parser instead of turning it into an empty "stop" response.
  if (chunks.length === 0) return input;

  const first = chunks[0] ?? {};
  const firstChoice = Array.isArray(first.choices)
    ? (first.choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const firstDelta = firstChoice?.delta as Record<string, unknown> | undefined;
  let content = '';
  let reasoning = '';
  let finishReason: string | null = null;
  let usage: unknown;
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

  for (const chunk of chunks) {
    if (chunk.usage !== undefined) usage = chunk.usage;
    const choice = Array.isArray(chunk.choices)
      ? (chunk.choices[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!choice) continue;
    if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (!delta) continue;
    if (typeof delta.content === 'string') content += delta.content;
    const reasoningPart = typeof delta.reasoning_content === 'string'
      ? delta.reasoning_content
      : typeof delta.reasoning === 'string'
        ? delta.reasoning
        : '';
    reasoning += reasoningPart;

    if (!Array.isArray(delta.tool_calls)) continue;
    for (const rawCall of delta.tool_calls) {
      if (!rawCall || typeof rawCall !== 'object') continue;
      const call = rawCall as Record<string, unknown>;
      const index = typeof call.index === 'number' ? call.index : toolCalls.size;
      const fn = call.function && typeof call.function === 'object'
        ? call.function as Record<string, unknown>
        : {};
      const previous = toolCalls.get(index);
      toolCalls.set(index, {
        id: typeof call.id === 'string' ? call.id : previous?.id ?? `hcnsec-tool-${index}`,
        name: typeof fn.name === 'string' ? fn.name : previous?.name ?? '',
        arguments: (previous?.arguments ?? '') + (typeof fn.arguments === 'string' ? fn.arguments : ''),
      });
    }
  }

  const normalizedDelta: Record<string, unknown> = {};
  const role = typeof firstDelta?.role === 'string' ? firstDelta.role : 'assistant';
  normalizedDelta.role = role;
  if (content.length > 0) normalizedDelta.content = content;
  if (reasoning.length > 0) normalizedDelta.reasoning_content = reasoning;
  const dsmlToolCalls = normalizeHcnsecDsmlToolCalls(content);
  if (dsmlToolCalls) {
    if (dsmlToolCalls.content.length > 0) normalizedDelta.content = dsmlToolCalls.content;
    else delete normalizedDelta.content;
    normalizedDelta.tool_calls = dsmlToolCalls.toolCalls;
    finishReason = 'tool_calls';
  } else if (toolCalls.size > 0) {
    normalizedDelta.tool_calls = [...toolCalls.entries()].map(([index, call]) => ({
      index,
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }));
  }

  const normalized = {
    id: typeof first.id === 'string' ? first.id : `hcnsec-${Date.now()}`,
    created: typeof first.created === 'number' ? first.created : Math.floor(Date.now() / 1000),
    model: typeof first.model === 'string' ? first.model : undefined,
    choices: [{
      index: 0,
      delta: normalizedDelta,
      finish_reason: finishReason ?? (toolCalls.size > 0 ? 'tool_calls' : 'stop'),
    }],
    ...(usage !== undefined ? { usage } : {}),
  };

  return `data: ${JSON.stringify(normalized)}\n\ndata: [DONE]\n\n`;
}

/**
 * Fetch wrapper used only by HCNSEC. Tool-call responses are normalized
 * after buffering; plain text streams retain their native low-latency path.
 */
export const hcnsecFetch: FetchFunction = async (input, init) => {
  const body = typeof init?.body === 'string'
    ? (() => {
        try { return JSON.parse(init.body) as Record<string, unknown>; } catch { return null; }
      })()
    : null;
  const hasTools = Array.isArray(body?.tools) && body.tools.length > 0;
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!response.ok || !hasTools || !response.body) return response;

  if (contentType.includes('text/event-stream')) {
    const raw = await response.text();
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(normalizeHcnsecSse(raw), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (contentType.includes('application/json')) {
    const raw = await response.text();
    try {
      const normalized = normalizeHcnsecJsonPayload(JSON.parse(raw) as unknown);
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return new Response(raw, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }

  return response;
};

/** Full capability set — vision + tools + jsonMode + streaming. */
export const CAPS_FULL = {
  vision: true,
  tools: true,
  jsonMode: true,
  streaming: true,
} as const;

/** Text-only capability set — tools + jsonMode + streaming (no vision). */
export const CAPS_TEXT = {
  tools: true,
  jsonMode: true,
  streaming: true,
} as const;

/** Shared factory for OpenAI-compatible chat APIs. */
export function openaiCompatibleFactory(
  name: string,
  baseURL: string,
  headers?: Record<string, string>,
  fetch?: FetchFunction,
): ByokProviderSpec['factory'] {
  return (apiKey) => {
    const provider = createOpenAICompatible({
      name,
      apiKey,
      baseURL,
      ...(headers ? { headers } : {}),
      ...(fetch ? { fetch } : {}),
    });
    return (modelId) => provider(modelId);
  };
}

/**
 * Validate and freeze a provider spec. Throws at module load if
 * defaultModels point at unknown catalog entries — catches drift
 * before a user hits a 404 at runtime.
 */
export function defineProvider(spec: ByokProviderSpec): ByokProviderSpec {
  const catalog = new Set(spec.models.map((m) => m.modelId));
  for (const [domain, modelId] of Object.entries(spec.defaultModels) as Array<
    [ModelDomain, string | null]
  >) {
    if (modelId == null) continue;
    if (!catalog.has(modelId)) {
      throw new Error(
        `BYOK provider "${spec.id}": defaultModels.${domain}="${modelId}" is not in models[]`,
      );
    }
  }
  if (spec.supports.vision && !spec.defaultModels.vision) {
    throw new Error(
      `BYOK provider "${spec.id}": supports.vision=true but defaultModels.vision is null`,
    );
  }
  if (spec.supports.embedding && !spec.defaultModels.embedding) {
    throw new Error(
      `BYOK provider "${spec.id}": supports.embedding=true but defaultModels.embedding is null`,
    );
  }
  if (spec.defaultModels.vision) {
    const m = spec.models.find((x) => x.modelId === spec.defaultModels.vision);
    if (m && m.capabilities && m.capabilities.vision === false) {
      throw new Error(
        `BYOK provider "${spec.id}": default vision model "${spec.defaultModels.vision}" is not vision-capable`,
      );
    }
  }
  return spec;
}
