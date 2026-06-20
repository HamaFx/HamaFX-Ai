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
  description: 'Claude Sonnet / Haiku — strong reasoning, slower.',
  pricingTier: 'medium',
  defaultModels: {
    fundamental: 'claude-sonnet-4-20250514',
    technical: 'claude-sonnet-4-20250514',
    summary: 'claude-haiku-4-5-20251001',
    vision: 'claude-sonnet-4-20250514',
    embedding: null, // Anthropic doesn't host an embedding model
  },
  bestFor: 'Deep reasoning',
  supports: { vision: true, embedding: false },
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
  description: 'GPT-4o / GPT-4o-mini — fast, vision-capable, embeds available.',
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