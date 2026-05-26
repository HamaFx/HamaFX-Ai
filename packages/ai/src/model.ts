// Model resolver: maps a model id string to whatever the AI SDK v5 needs to
// route the call. We support two transport modes (see packages/shared/src/env.ts):
//
//   1. Vercel AI Gateway (AI_GATEWAY_API_KEY set):
//      The SDK accepts the prefixed id ("openai/gpt-4.1", "google/gemini-2.5-flash")
//      directly when the gateway env var is present. We pass the string through.
//
//   2. Direct Google Gemini (GOOGLE_GENERATIVE_AI_API_KEY set, gateway absent):
//      The SDK has no global router, so we have to construct a LanguageModel
//      instance via `@ai-sdk/google`. We strip the "google/" prefix and call
//      `google('<bareId>')`.
//
// This keeps the rest of the AI package transport-agnostic — every caller
// just hands the env'd model id to `resolveModel(...)` and gets back something
// `streamText` / `generateText` can accept.

import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export interface ResolveModelEnv {
  AI_GATEWAY_API_KEY?: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
}

/**
 * Resolve a model id to either:
 *   - the same string (gateway mode), or
 *   - a `LanguageModel` instance (direct Gemini mode).
 *
 * Throws if no transport is configured for the requested id.
 */
export function resolveModel(modelId: string, env: ResolveModelEnv): LanguageModel | string {
  const usingGateway = Boolean(env.AI_GATEWAY_API_KEY);
  if (usingGateway) {
    return modelId;
  }

  if (modelId.startsWith('google/')) {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY is required to use a `google/...` model when AI_GATEWAY_API_KEY is not set',
      );
    }
    const bareId = modelId.slice('google/'.length);
    return google(bareId);
  }

  throw new Error(
    `Cannot resolve model "${modelId}" without AI_GATEWAY_API_KEY. Personal-mode supports direct Google models only — set GOOGLE_GENERATIVE_AI_API_KEY and use a "google/..." model id, or set AI_GATEWAY_API_KEY to enable the gateway.`,
  );
}
