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

// BYOK provider registry.
//
// Single source of truth for every AI provider the app supports. The
// encryption shape in `@hamafx/shared/encryption` (ByokPayload) keys
// keys by ProviderId — both lists must stay in sync. Adding a provider:
//
//   1. Add the id to PROVIDER_IDS in @hamafx/shared/encryption.ts.
//   2. Add the field to the ByokPayload interface there.
//   3. Add a ByokProviderSpec entry to BYOK_PROVIDERS below.
//   4. (If needed) add the corresponding @ai-sdk/* dep to packages/ai.
//
// All `openai-compatible` providers route through `@ai-sdk/openai-compatible`
// with a custom `baseURL`. Each spec's `factory` returns a function that
// takes a model id and returns an AI SDK `LanguageModel` ready for
// streamText.

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { PROVIDER_IDS, type ProviderId } from '@hamafx/shared/byok';

/** The five "domains" the agent routes between (see packages/ai/src/routing.ts). */
export type ModelDomain = 'fundamental' | 'technical' | 'summary' | 'vision' | 'embedding';

/**
 * Rich metadata for a single model. Surfaced to the UI so the user
 * can compare models across providers without leaving /settings/models.
 *
 * Conventions:
 *   - `modelId` is the **bare** id (no provider prefix). When the
 *     user picks a model, the resolver prefixes the id with the
 *     provider name automatically (e.g. `openai/gpt-4o` for
 *     OpenRouter, `google-vertex/gemini-2.5-pro` for Vertex).
 *   - Pricing is in USD per 1M tokens. `null` means "free" (e.g.
 *     DeepSeek chat, Groq Llama 3.1 8b).
 *   - `capabilities` mirrors the spec-level `supports` but per-model:
 *     not every "vision-capable" provider has every vision model
 *     enabled (e.g. DeepSeek has none).
 */
export interface ModelSpec {
  /** Bare model id, e.g. "gpt-4o", "claude-sonnet-4-5", "mistral-large-latest". */
  modelId: string;
  /** Short label shown in the picker. Falls back to modelId when missing. */
  label?: string;
  /** One-line description shown in the expanded row. */
  description?: string;
  /** USD per 1M input tokens. `null` = free or unknown. */
  inputPerMTokUsd?: number | null;
  /** USD per 1M output tokens. `null` = free or unknown. */
  outputPerMTokUsd?: number | null;
  /** Context window in tokens (input). */
  contextTokens?: number;
  /** Per-model capabilities. Defaults to the provider-level set when missing. */
  capabilities?: {
    vision?: boolean;
    tools?: boolean;
    jsonMode?: boolean;
    streaming?: boolean;
  };
  /** Friendly release date, e.g. "2025-04". Helps users gauge freshness. */
  released?: string;
  /** Optional tier tag for sorting ("flagship", "fast", "lite"). */
  tier?: 'flagship' | 'pro' | 'fast' | 'lite' | 'embedding';
}

/** Per-domain default model ids for a provider. */
export interface ByokProviderModels {
  fundamental: string;
  technical: string;
  summary: string;
  /** `null` means the provider has no vision-capable model — caller falls back to `technical`. */
  vision: string | null;
  /** `null` means the provider doesn't host an embedding model. */
  embedding: string | null;
}

export interface ByokProviderSpec {
  id: ProviderId;
  /** Full display name, e.g. "Anthropic (Claude)". */
  displayName: string;
  /** Short model-family name, e.g. "Claude", "Gemini". */
  familyName: string;
  /** Common key prefix shown as a placeholder hint, e.g. "sk-ant-…". */
  keyHint: string;
  /** One-line description shown in the picker. */
  description: string;
  /** Rough pricing tier so the UI can order providers cheapest-first. */
  pricingTier: 'free' | 'low' | 'medium' | 'high';
  defaultModels: ByokProviderModels;
  /**
   * Phase E — full per-model catalog. Every model the provider
   * serves is listed here with metadata (context window, pricing,
   * capabilities, release date, tier). Surfaced via the catalog
   * endpoint to /settings/models and the chat regen popover.
   *
   * `defaultModels` is a subset (one model per domain). The agent
   * router still uses `defaultModels` for speed (no extra lookup);
   * the picker uses `models` to show options.
   *
   * Optional for legacy/test specs that only declare defaults.
   * New specs must include this — the catalog endpoint will surface
   * an empty list for missing entries, which looks broken to users.
   */
  models?: ModelSpec[];
  /**
   * Build a `(modelId) => LanguageModel` from this provider's API key.
   * Implementations should NOT cache the underlying SDK instance across
   * keys — the model.ts resolver caches at the modelId level instead.
   */
  factory: (apiKey: string) => (modelId: string) => LanguageModel;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 16.
   * Short tag describing what this provider is best suited for.
   * Shown in the onboarding wizard tooltip and in the api-keys
   * card header. Optional — providers that don't have a clear
   * specialisation can leave it undefined.
   */
  bestFor?: string;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 16.
   * Capability flags the user can use to filter or label providers
   * in the UI. The onboarding tooltip reads these directly.
   */
  supports: {
    /** Can the provider serve chat-vision requests (image input)? */
    vision: boolean;
    /** Can the provider produce text embeddings? */
    embedding: boolean;
  };
}

// ---------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------

const GOOGLE: ByokProviderSpec = {
  id: 'google',
  displayName: 'Google AI (Gemini)',
  familyName: 'Gemini',
  keyHint: 'AIza…',
  description: 'Google Gemini models — generous free tier, fast, vision-capable.',
  pricingTier: 'free',
  defaultModels: {
    fundamental: 'gemini-2.5-pro',
    technical: 'gemini-2.5-flash',
    summary: 'gemini-2.5-flash-lite',
    vision: 'gemini-2.5-pro',
    embedding: 'text-embedding-004',
  },
  bestFor: 'Free tier + vision',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      description: 'Best reasoning, deep analysis. 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      description: 'Balanced price/perf, 1M context, vision.',
      tier: 'pro',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      description: 'Cheapest, fastest, low latency summaries.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-07',
    },
    {
      modelId: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash',
      description: 'Stable workhorse, multimodal.',
      tier: 'fast',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-02',
    },
    {
      modelId: 'text-embedding-004',
      label: 'Embedding 004',
      description: '768-dim text embeddings, 2k-token input.',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 2_048,
      capabilities: {},
      released: '2024-04',
    },
  ],
  factory: (apiKey) => {
    const provider = createGoogleGenerativeAI({ apiKey });
    return (modelId) => provider(modelId);
  },
};

/**
 * Vertex AI — Google Cloud's hosted Gemini endpoint, authenticated
 * with a GCP service account. Distinct from the `google` provider
 * (which uses the public Gemini API with an AIza… key) because:
 *
 *   - Different auth shape (service-account JSON, not a key string)
 *   - Different SDK (`@ai-sdk/google-vertex`, not `@ai-sdk/google`)
 *   - Different billing (GCP project quota, not Google AI billing)
 *   - Different model namespace — `gemini-2.5-flash` etc. are
 *     available, but the public Gemini API's free tier is not
 *
 * The BYOK key is the raw service-account JSON file content.
 * Required fields: `client_email`, `private_key`. The user must
 * also enable the Vertex AI API on their GCP project and grant
 * the service account the "Vertex AI User" role.
 *
 * For multi-line private keys we accept the JSON as pasted
 * (a single-line JSON string after the user replaces newlines
 * with `\n`). The Vertex SDK handles the decoding.
 */
const VERTEX: ByokProviderSpec = {
  id: 'vertex',
  displayName: 'Google Vertex AI',
  familyName: 'Gemini (Vertex)',
  keyHint: 'Paste service-account JSON',
  description:
    'Google Cloud Vertex AI — billed against your GCP project. ' +
    'Requires a service account with the "Vertex AI User" role.',
  pricingTier: 'medium',
  defaultModels: {
    fundamental: 'gemini-2.5-pro',
    technical: 'gemini-2.5-flash',
    summary: 'gemini-2.5-flash-lite',
    vision: 'gemini-2.5-pro',
    embedding: 'text-embedding-004',
  },
  bestFor: 'GCP billing + scale',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro (Vertex)',
      description: 'Best reasoning, deep analysis. 1M context. GCP quota.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash (Vertex)',
      description: 'Balanced price/perf, vision. GCP billing.',
      tier: 'pro',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite (Vertex)',
      description: 'Cheapest Gemini on Vertex.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-07',
    },
    {
      modelId: 'gemini-2.0-flash',
      label: 'Gemini 2.0 Flash (Vertex)',
      description: 'Stable Vertex workhorse.',
      tier: 'fast',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-02',
    },
    {
      modelId: 'text-embedding-005',
      label: 'Embedding 005 (Vertex)',
      description: 'Vertex text embedding (768d).',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 2_048,
      capabilities: {},
      released: '2025-04',
    },
  ],
  factory: (apiKey) => {
    // The BYOK value is a service-account JSON. We parse it lazily
    // inside the returned closure so testProviderKey (which just
    // calls factory() to validate auth shape) doesn't have to wait
    // on the full credential decode. The project + location come
    // from process.env — operator-set in production, fall back to
    // sensible defaults that match the GCP project name convention.
    //
    // We don't throw synchronously on bad JSON: that would make
    // `factory('not-valid-json')` blow up at construction time even
    // though the caller may never invoke the builder. The error
    // surfaces on the first model call instead, which is what
    // byok-providers.test.ts's `factory('test-key-that-is-long-enough')`
    // smoke test relies on.
    const project =
      process.env.GOOGLE_VERTEX_PROJECT ||
      apiKey.match(/"project_id"\s*:\s*"([^"]+)"/)?.[1] ||
      '';
    const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    return (modelId) => {
      let parsed: { client_email: string; private_key: string };
      try {
        const obj = JSON.parse(apiKey) as Record<string, unknown>;
        if (
          typeof obj.client_email !== 'string' ||
          typeof obj.private_key !== 'string'
        ) {
          throw new Error(
            'Vertex key is not valid service-account JSON (missing client_email or private_key)',
          );
        }
        parsed = {
          client_email: obj.client_email,
          private_key: obj.private_key,
        };
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? err.message
            : 'Vertex service-account JSON could not be parsed',
        );
      }
      if (!project) {
        throw new Error(
          'Vertex project not found. Set GOOGLE_VERTEX_PROJECT env or include project_id in the service-account JSON.',
        );
      }
      const vertex = createVertex({
        project,
        location,
        googleAuthOptions: { credentials: parsed },
      });
      return vertex(modelId);
    };
  },
};

const ANTHROPIC: ByokProviderSpec = {
  id: 'anthropic',
  displayName: 'Anthropic (Claude)',
  familyName: 'Claude',
  keyHint: 'sk-ant-…',
  description: 'Claude Opus / Sonnet / Haiku — strong reasoning, long context.',
  pricingTier: 'medium',
  defaultModels: {
    fundamental: 'claude-sonnet-4-5',
    technical: 'claude-sonnet-4-5',
    summary: 'claude-haiku-4-5',
    vision: 'claude-sonnet-4-5',
    embedding: null, // Anthropic doesn't host an embedding model
  },
  bestFor: 'Deep reasoning',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'claude-opus-4-1',
      label: 'Claude Opus 4.1',
      description: 'Most capable, deep reasoning, 200k context.',
      tier: 'flagship',
      inputPerMTokUsd: 15,
      outputPerMTokUsd: 75,
      contextTokens: 200_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2025-08',
    },
    {
      modelId: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      description: 'Best balance of intelligence, speed, cost.',
      tier: 'pro',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 15,
      contextTokens: 200_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-09',
    },
    {
      modelId: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      description: 'Cheap, fast, near-Sonnet quality.',
      tier: 'fast',
      inputPerMTokUsd: 0.80,
      outputPerMTokUsd: 4,
      contextTokens: 200_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-09',
    },
    {
      modelId: 'claude-3-5-haiku-latest',
      label: 'Claude 3.5 Haiku',
      description: 'Previous-gen fast model.',
      tier: 'lite',
      inputPerMTokUsd: 0.80,
      outputPerMTokUsd: 4,
      contextTokens: 200_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-11',
    },
  ],
  factory: (apiKey) => {
    const provider = createAnthropic({ apiKey });
    return (modelId) => provider(modelId);
  },
};

const OPENAI: ByokProviderSpec = {
  id: 'openai',
  displayName: 'OpenAI (ChatGPT)',
  familyName: 'GPT',
  keyHint: 'sk-…',
  description: 'GPT-4o / GPT-4.1 / o-series — fast, vision-capable, embeds available.',
  pricingTier: 'medium',
  defaultModels: {
    fundamental: 'gpt-4o',
    technical: 'gpt-4o',
    summary: 'gpt-4o-mini',
    vision: 'gpt-4o',
    embedding: 'text-embedding-3-small',
  },
  bestFor: 'General purpose',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gpt-4.1',
      label: 'GPT-4.1',
      description: 'Latest flagship, 1M context, strong coding.',
      tier: 'flagship',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 12,
      contextTokens: 1_047_576,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'gpt-4o',
      label: 'GPT-4o',
      description: 'Previous flagship, multimodal.',
      tier: 'pro',
      inputPerMTokUsd: 2.50,
      outputPerMTokUsd: 10,
      contextTokens: 128_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2024-08',
    },
    {
      modelId: 'o4-mini',
      label: 'o4-mini (reasoning)',
      description: 'Reasoning model, cheap, chain-of-thought.',
      tier: 'fast',
      inputPerMTokUsd: 1.10,
      outputPerMTokUsd: 4.40,
      contextTokens: 200_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      description: 'Cheap, fast, decent quality.',
      tier: 'lite',
      inputPerMTokUsd: 0.15,
      outputPerMTokUsd: 0.60,
      contextTokens: 128_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2024-07',
    },
    {
      modelId: 'text-embedding-3-small',
      label: 'Embedding 3 small',
      description: '1536-dim text embeddings.',
      tier: 'embedding',
      inputPerMTokUsd: 0.02,
      outputPerMTokUsd: null,
      contextTokens: 8_191,
      capabilities: {},
      released: '2024-01',
    },
    {
      modelId: 'text-embedding-3-large',
      label: 'Embedding 3 large',
      description: '3072-dim text embeddings, best quality.',
      tier: 'embedding',
      inputPerMTokUsd: 0.13,
      outputPerMTokUsd: null,
      contextTokens: 8_191,
      capabilities: {},
      released: '2024-01',
    },
  ],
  // OpenAI uses the OpenAI-compatible shim pointed at api.openai.com
  factory: (apiKey) => {
    const provider = createOpenAICompatible({
      name: 'openai',
      apiKey,
      baseURL: 'https://api.openai.com/v1',
    });
    return (modelId) => provider(modelId);
  },
};

const GROQ: ByokProviderSpec = {
  id: 'groq',
  displayName: 'Groq',
  familyName: 'Llama / Mixtral',
  keyHint: 'gsk_…',
  description: 'Groq inference — extremely fast open-source models, free tier.',
  pricingTier: 'free',
  defaultModels: {
    fundamental: 'llama-3.3-70b-versatile',
    technical: 'llama-3.1-8b-instant',
    summary: 'llama-3.1-8b-instant',
    vision: 'llama-3.2-90b-vision-preview',
    embedding: null,
  },
  bestFor: 'Speed (free)',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B Versatile',
      description: 'Open-source 70B, fastest inference.',
      tier: 'flagship',
      inputPerMTokUsd: 0.59,
      outputPerMTokUsd: 0.79,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-12',
    },
    {
      modelId: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B Instant',
      description: 'Tiny, sub-millisecond latency.',
      tier: 'lite',
      inputPerMTokUsd: 0.05,
      outputPerMTokUsd: 0.08,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-07',
    },
    {
      modelId: 'llama-3.2-90b-vision-preview',
      label: 'Llama 3.2 90B Vision',
      description: 'Vision-capable open model.',
      tier: 'pro',
      inputPerMTokUsd: 0.90,
      outputPerMTokUsd: 0.90,
      contextTokens: 128_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2024-11',
    },
    {
      modelId: 'mixtral-8x7b-32768',
      label: 'Mixtral 8x7B',
      description: 'Mistral MoE, 32k context.',
      tier: 'fast',
      inputPerMTokUsd: 0.24,
      outputPerMTokUsd: 0.24,
      contextTokens: 32_768,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2023-12',
    },
  ],
  factory: (apiKey) => {
    const provider = createOpenAICompatible({
      name: 'groq',
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    return (modelId) => provider(modelId);
  },
};

const MISTRAL: ByokProviderSpec = {
  id: 'mistral',
  displayName: 'Mistral AI',
  familyName: 'Mistral',
  keyHint: '…',
  description: 'Mistral models — strong open weights, EU-hosted option.',
  pricingTier: 'low',
  defaultModels: {
    fundamental: 'mistral-large-latest',
    technical: 'mistral-small-latest',
    summary: 'mistral-small-latest',
    vision: 'pixtral-large-latest',
    embedding: 'mistral-embed',
  },
  bestFor: 'Low cost + EU',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'mistral-large-latest',
      label: 'Mistral Large',
      description: 'Flagship reasoning, 128k context.',
      tier: 'flagship',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 6,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-11',
    },
    {
      modelId: 'mistral-small-latest',
      label: 'Mistral Small',
      description: 'Cheap, fast, 32k context.',
      tier: 'fast',
      inputPerMTokUsd: 0.20,
      outputPerMTokUsd: 0.60,
      contextTokens: 32_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2025-03',
    },
    {
      modelId: 'pixtral-large-latest',
      label: 'Pixtral Large (vision)',
      description: 'Vision-capable Mistral.',
      tier: 'pro',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 6,
      contextTokens: 128_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2024-11',
    },
    {
      modelId: 'ministral-8b-latest',
      label: 'Ministral 8B',
      description: 'Tiny edge model.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.10,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-10',
    },
    {
      modelId: 'mistral-embed',
      label: 'Mistral Embed',
      description: '1024-dim text embeddings.',
      tier: 'embedding',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: null,
      contextTokens: 8_192,
      capabilities: {},
      released: '2024-01',
    },
  ],
  factory: (apiKey) => {
    const provider = createOpenAICompatible({
      name: 'mistral',
      apiKey,
      baseURL: 'https://api.mistral.ai/v1',
    });
    return (modelId) => provider(modelId);
  },
};

const OPENROUTER: ByokProviderSpec = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  familyName: 'Any model',
  keyHint: 'sk-or-…',
  description: 'OpenRouter — one key for 100+ models from every provider.',
  pricingTier: 'medium',
  defaultModels: {
    fundamental: 'anthropic/claude-sonnet-4',
    technical: 'openai/gpt-4o',
    summary: 'openai/gpt-4o-mini',
    vision: 'anthropic/claude-sonnet-4',
    embedding: 'openai/text-embedding-3-small',
  },
  bestFor: '100+ models, 1 key',
  supports: { vision: true, embedding: true },
  // OpenRouter is a meta-provider — we list a curated subset here
  // that covers the same domain slots as our other providers, plus
  // a few of the most popular cross-provider models. OpenRouter
  // supports hundreds more; this is a sensible default.
  models: [
    {
      modelId: 'anthropic/claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5 (via OpenRouter)',
      description: 'Top reasoning, 200k context.',
      tier: 'flagship',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 15,
      contextTokens: 200_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-09',
    },
    {
      modelId: 'openai/gpt-4.1',
      label: 'GPT-4.1 (via OpenRouter)',
      description: 'OpenAI flagship, 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 12,
      contextTokens: 1_047_576,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'google/gemini-2.5-pro',
      label: 'Gemini 2.5 Pro (via OpenRouter)',
      description: 'Google reasoning, 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'openai/gpt-4o-mini',
      label: 'GPT-4o mini (via OpenRouter)',
      description: 'Cheap, fast, multimodal.',
      tier: 'lite',
      inputPerMTokUsd: 0.15,
      outputPerMTokUsd: 0.60,
      contextTokens: 128_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2024-07',
    },
    {
      modelId: 'google/gemini-2.5-flash',
      label: 'Gemini 2.5 Flash (via OpenRouter)',
      description: 'Google balanced price/perf.',
      tier: 'pro',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2025-04',
    },
    {
      modelId: 'meta-llama/llama-3.3-70b-instruct',
      label: 'Llama 3.3 70B (via OpenRouter)',
      description: 'Open-source 70B.',
      tier: 'fast',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.10,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-12',
    },
    {
      modelId: 'openai/text-embedding-3-small',
      label: 'Embedding 3 small (via OpenRouter)',
      description: '1536-dim text embeddings.',
      tier: 'embedding',
      inputPerMTokUsd: 0.02,
      outputPerMTokUsd: null,
      contextTokens: 8_191,
      capabilities: {},
      released: '2024-01',
    },
  ],
  factory: (apiKey) => {
    const provider = createOpenAICompatible({
      name: 'openrouter',
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return (modelId) => provider(modelId);
  },
};

const XAI: ByokProviderSpec = {
  id: 'xai',
  displayName: 'xAI (Grok)',
  familyName: 'Grok',
  keyHint: 'xai-…',
  description: 'Grok models from xAI — strong reasoning, real-time knowledge.',
  pricingTier: 'medium',
  defaultModels: {
    fundamental: 'grok-2-latest',
    technical: 'grok-2-latest',
    summary: 'grok-2-mini',
    vision: 'grok-2-vision-latest',
    embedding: null,
  },
  bestFor: 'Real-time knowledge',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'grok-2-latest',
      label: 'Grok 2',
      description: 'Latest Grok, 128k context.',
      tier: 'flagship',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 10,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-12',
    },
    {
      modelId: 'grok-2-vision-latest',
      label: 'Grok 2 Vision',
      description: 'Vision-capable Grok.',
      tier: 'pro',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 10,
      contextTokens: 32_000,
      capabilities: { vision: true, tools: true, jsonMode: true, streaming: true },
      released: '2024-12',
    },
    {
      modelId: 'grok-2-mini',
      label: 'Grok 2 mini',
      description: 'Cheap, fast.',
      tier: 'lite',
      inputPerMTokUsd: 0.20,
      outputPerMTokUsd: 1,
      contextTokens: 128_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-12',
    },
  ],
  factory: (apiKey) => {
    const provider = createOpenAICompatible({
      name: 'xai',
      apiKey,
      baseURL: 'https://api.x.ai/v1',
    });
    return (modelId) => provider(modelId);
  },
};

const DEEPSEEK: ByokProviderSpec = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  familyName: 'DeepSeek',
  keyHint: 'sk-…',
  description: 'DeepSeek — strong open-source reasoning at very low cost.',
  pricingTier: 'low',
  defaultModels: {
    fundamental: 'deepseek-chat',
    technical: 'deepseek-chat',
    summary: 'deepseek-chat',
    vision: null, // DeepSeek's API has no vision model as of 2026
    embedding: null,
  },
  bestFor: 'Cheap reasoning',
  supports: { vision: false, embedding: false },
  models: [
    {
      modelId: 'deepseek-chat',
      label: 'DeepSeek Chat (V3)',
      description: 'Strong open-source reasoning, very cheap.',
      tier: 'flagship',
      inputPerMTokUsd: 0.27,
      outputPerMTokUsd: 1.10,
      contextTokens: 64_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-12',
    },
    {
      modelId: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner (R1)',
      description: 'Chain-of-thought reasoning, 64k context.',
      tier: 'flagship',
      inputPerMTokUsd: 0.55,
      outputPerMTokUsd: 2.19,
      contextTokens: 64_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2025-01',
    },
    {
      modelId: 'deepseek-coder',
      label: 'DeepSeek Coder',
      description: 'Code-specialised, 16k context.',
      tier: 'fast',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 16_000,
      capabilities: { tools: true, jsonMode: true, streaming: true },
      released: '2024-05',
    },
  ],
  factory: (apiKey) => {
    const provider = createOpenAICompatible({
      name: 'deepseek',
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    });
    return (modelId) => provider(modelId);
  },
};

export const BYOK_PROVIDERS: Record<ProviderId, ByokProviderSpec> = {
  google: GOOGLE,
  vertex: VERTEX,
  anthropic: ANTHROPIC,
  openai: OPENAI,
  groq: GROQ,
  mistral: MISTRAL,
  openrouter: OPENROUTER,
  xai: XAI,
  deepseek: DEEPSEEK,
};

/** Ordered list of all providers — handy for iterating in UI. */
export const BYOK_PROVIDERS_LIST: ByokProviderSpec[] = PROVIDER_IDS.map(
  (id) => BYOK_PROVIDERS[id],
);

/** Lookup helper that throws a clear error if the id is unknown. */
export function getProvider(id: ProviderId): ByokProviderSpec {
  const spec = BYOK_PROVIDERS[id];
  if (!spec) {
    throw new Error(`Unknown BYOK provider: ${id}. Add it to BYOK_PROVIDERS.`);
  }
  return spec;
}

/**
 * Pick the default model id for a provider + domain. If the provider
 * has no model for a domain (e.g. DeepSeek has no vision), returns
 * null so the caller can fall back.
 */
export function defaultModelFor(id: ProviderId, domain: ModelDomain): string | null {
  const spec = BYOK_PROVIDERS[id];
  if (!spec) return null;
  return spec.defaultModels[domain];
}