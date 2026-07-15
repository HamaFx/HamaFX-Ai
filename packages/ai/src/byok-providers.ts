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
// encryption shape in `@hamafx/shared/byok` (ByokPayload / PROVIDER_IDS)
// keys secrets by ProviderId — both lists must stay in sync.
//
// ─── Adding a provider (checklist) ─────────────────────────────────────
//   1. Add the id to PROVIDER_IDS + ByokPayload in packages/shared/src/byok.ts
//   2. Add a defineProvider({...}) entry below and register it in BYOK_PROVIDERS
//   3. If native SDK support is available, import createX from @ai-sdk/<x>
//      otherwise use createOpenAICompatible({ name, apiKey, baseURL })
//   4. List flagship + fast/cheap + vision/embedding models with pricing
//   5. Ensure defaultModels.* ids exist in models[] (defineProvider checks this)
//   6. (Optional) extend envFallbackKeys() in model.ts for operator env keys
//   7. Add/adjust unit tests if defaults or capabilities change
//
// Catalog last reviewed against provider docs: 2026-07-14.
//
// OpenAI-compatible providers share one factory helper so future aggregators
// only need baseURL + catalog metadata.

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
 *     provider name automatically (e.g. `openai/gpt-5.6-terra`).
 *   - Pricing is in USD per 1M tokens. `null` means free/unknown.
 *   - `capabilities` is per-model (not every model on a vision-capable
 *     provider is itself vision-capable).
 */
export interface ModelSpec {
  /** Bare model id, e.g. "gpt-5.6-terra", "claude-sonnet-5". */
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
  /** Friendly release date, e.g. "2026-06". Helps users gauge freshness. */
  released?: string;
  /** Optional tier tag for sorting ("flagship", "fast", "lite"). */
  tier?: 'flagship' | 'pro' | 'fast' | 'lite' | 'embedding';
}

/** Per-domain default model ids for a provider. */
export interface ByokProviderModels {
  fundamental: string;
  technical: string;
  summary: string;
  /** `null` means the provider has no vision-capable model. */
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
   * Full per-model catalog. Every model the provider serves (that we
   * surface) is listed here with metadata. Surfaced via the catalog
   * endpoint to /settings/models and the chat regen popover.
   *
   * `defaultModels` must reference ids that exist in this list
   * (enforced by `defineProvider`).
   */
  models: ModelSpec[];
  /**
   * Build a `(modelId) => LanguageModel` from this provider's API key.
   * Implementations should NOT cache the underlying SDK instance across
   * keys — the model.ts resolver caches at the modelId level instead.
   */
  factory: (apiKey: string) => (modelId: string) => LanguageModel;
  /** Short tag describing what this provider is best suited for. */
  bestFor?: string;
  /** Capability flags the UI uses to filter/label providers. */
  supports: {
    /** Can the provider serve chat-vision requests (image input)? */
    vision: boolean;
    /** Can the provider produce text embeddings? */
    embedding: boolean;
  };
  /**
   * Optional OpenAI-compatible base URL (documentation / future tooling).
   * Native SDK providers leave this undefined.
   */
  baseURL?: string;
  /** Optional docs URL for operators / settings UI. */
  docsUrl?: string;
}

// ---------------------------------------------------------------------
// Helpers — keep provider definitions short and future-proof
// ---------------------------------------------------------------------

const CAPS_FULL = {
  vision: true,
  tools: true,
  jsonMode: true,
  streaming: true,
} as const;

const CAPS_TEXT = {
  tools: true,
  jsonMode: true,
  streaming: true,
} as const;

/**
 * Normalize a PEM private key so it works with OpenSSL 3.x's stricter
 * decoder. Environment variables often carry the key as one long line
 * (no newlines), which the legacy `Sign.sign()` API rejects with
 * `ERR_OSSL_UNSUPPORTED` / `DECODER routines::unsupported`.
 *
 * Duplicated from model.ts (can't import due to circular dep).
 */
function normalizePemPrivateKey(raw: string): string {
  let key = raw.replace(/\r\n/g, '\n').trim();
  const headerMatch = key.match(/^-----BEGIN [A-Z ]+PRIVATE KEY-----/m);
  const footerMatch = key.match(/-----END [A-Z ]+PRIVATE KEY-----$/m);
  if (!headerMatch || !footerMatch) return raw;
  const header = headerMatch[0];
  const footer = footerMatch[0];
  let body = key
    .replace(header, '')
    .replace(footer, '')
    .replace(/\s+/g, '');
  if (body.length === 0) return raw;
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `${header}\n${wrapped}\n${footer}\n`;
}

/** Shared factory for OpenAI-compatible chat APIs. */
function openaiCompatibleFactory(
  name: string,
  baseURL: string,
  headers?: Record<string, string>,
): ByokProviderSpec['factory'] {
  return (apiKey) => {
    const provider = createOpenAICompatible({
      name,
      apiKey,
      baseURL,
      ...(headers ? { headers } : {}),
    });
    return (modelId) => provider(modelId);
  };
}

/**
 * Validate and freeze a provider spec. Throws at module load if
 * defaultModels point at unknown catalog entries — catches drift
 * before a user hits a 404 at runtime.
 */
function defineProvider(spec: ByokProviderSpec): ByokProviderSpec {
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

// ---------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------

const GOOGLE = defineProvider({
  id: 'google',
  displayName: 'Google AI (Gemini)',
  familyName: 'Gemini',
  keyHint: 'AIza…',
  description: 'Google Gemini models — generous free tier, fast, vision-capable.',
  pricingTier: 'free',
  docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  defaultModels: {
    // Prefer stable 2.5 for reliability; 3.x flagship available in catalog.
    fundamental: 'gemini-2.5-pro',
    technical: 'gemini-2.5-flash',
    summary: 'gemini-2.5-flash-lite',
    vision: 'gemini-2.5-pro',
    embedding: 'gemini-embedding-001',
  },
  bestFor: 'Free tier + long context',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash',
      description: 'Newest stable Flash — strong agentic + multimodal.',
      tier: 'flagship',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-06',
    },
    {
      modelId: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash-Lite',
      description: 'Newest cheap/fast Gemini for high-volume turns.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      description: 'Best 2.5 reasoning, deep analysis. 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
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
      capabilities: CAPS_FULL,
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      description: 'Cheapest stable Gemini for summaries/planner.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2025-07',
    },
    {
      modelId: 'gemini-embedding-2',
      label: 'Gemini Embedding 2',
      description: 'Multimodal embeddings (text/image/video/audio/PDF).',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 8_192,
      capabilities: {},
      released: '2026-04',
    },
    {
      modelId: 'gemini-embedding-001',
      label: 'Gemini Embedding 001',
      description: 'Stable text embeddings for RAG.',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 2_048,
      capabilities: {},
      released: '2025-01',
    },
    // Kept for users who already saved this id in settings.
    {
      modelId: 'text-embedding-004',
      label: 'Embedding 004 (legacy)',
      description: 'Legacy Gemini embedding id — prefer gemini-embedding-001.',
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
});

/**
 * Vertex AI — Google Cloud's hosted Gemini endpoint, authenticated
 * with a GCP service account. Distinct from the `google` provider
 * (public Gemini API key).
 */
const VERTEX = defineProvider({
  id: 'vertex',
  displayName: 'Google Vertex AI',
  familyName: 'Gemini (Vertex)',
  keyHint: '{…service account JSON…}',
  description:
    'Vertex AI Gemini via GCP service account. Bills against your GCP project quota.',
  pricingTier: 'medium',
  docsUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference',
  defaultModels: {
    fundamental: 'gemini-2.5-pro',
    technical: 'gemini-2.5-flash',
    summary: 'gemini-2.5-flash-lite',
    vision: 'gemini-2.5-pro',
    embedding: 'text-embedding-005',
  },
  bestFor: 'GCP quota / enterprise',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash (Vertex)',
      description: 'Newest Flash on Vertex with GCP billing.',
      tier: 'flagship',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-06',
    },
    {
      modelId: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro (Vertex)',
      description: 'Best reasoning, deep analysis. 1M context. GCP quota.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
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
      capabilities: CAPS_FULL,
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
      capabilities: CAPS_FULL,
      released: '2025-07',
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
    // Parse SA JSON lazily inside the returned closure so callers that
    // only construct the builder (tests) don't pay parse cost / throw early.
    const projectFromKey = apiKey.match(/"project_id"\s*:\s*"([^"]+)"/)?.[1] || '';
    const project = process.env.GOOGLE_VERTEX_PROJECT || projectFromKey || '';
    const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    return (modelId) => {
      let parsed: { client_email: string; private_key: string };
      try {
        const obj = JSON.parse(apiKey) as Record<string, unknown>;
        if (typeof obj.client_email !== 'string' || typeof obj.private_key !== 'string') {
          throw new Error(
            'Vertex key is not valid service-account JSON (missing client_email or private_key)',
          );
        }
        // Normalize the PEM private key so it works with OpenSSL 3.x.
        // Environment variables often carry the key as one long line
        // (no newlines), which the legacy Sign.sign() API rejects with
        // ERR_OSSL_UNSUPPORTED / DECODER routines::unsupported.
        parsed = {
          client_email: obj.client_email,
          private_key: normalizePemPrivateKey(obj.private_key),
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
});

const ANTHROPIC = defineProvider({
  id: 'anthropic',
  displayName: 'Anthropic (Claude)',
  familyName: 'Claude',
  keyHint: 'sk-ant-…',
  description: 'Claude Fable / Opus / Sonnet / Haiku — strong reasoning, long context, vision.',
  pricingTier: 'high',
  docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  defaultModels: {
    fundamental: 'claude-opus-4-8',
    technical: 'claude-sonnet-5',
    summary: 'claude-haiku-4-5',
    vision: 'claude-sonnet-5',
    embedding: null,
  },
  bestFor: 'Deep reasoning + agents',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'claude-fable-5',
      label: 'Claude Fable 5',
      description: 'Most capable widely-released Claude (2026).',
      tier: 'flagship',
      inputPerMTokUsd: 5,
      outputPerMTokUsd: 25,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-06',
    },
    {
      modelId: 'claude-opus-4-8',
      label: 'Claude Opus 4.8',
      description: 'Top agentic coding / enterprise reasoning.',
      tier: 'flagship',
      inputPerMTokUsd: 5,
      outputPerMTokUsd: 25,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'claude-sonnet-5',
      label: 'Claude Sonnet 5',
      description: 'Best balance of intelligence, speed, cost.',
      tier: 'pro',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 15,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      description: 'Cheap, fast, near-Sonnet quality.',
      tier: 'fast',
      inputPerMTokUsd: 1,
      outputPerMTokUsd: 5,
      contextTokens: 200_000,
      capabilities: CAPS_FULL,
      released: '2025-10',
    },
    // Still valid aliases kept for saved user settings / tests.
    {
      modelId: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      description: 'Previous-gen Sonnet (still supported).',
      tier: 'pro',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 15,
      contextTokens: 200_000,
      capabilities: CAPS_FULL,
      released: '2025-09',
    },
    {
      modelId: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      description: 'Previous Opus generation.',
      tier: 'flagship',
      inputPerMTokUsd: 5,
      outputPerMTokUsd: 25,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-02',
    },
  ],
  factory: (apiKey) => {
    const provider = createAnthropic({ apiKey });
    return (modelId) => provider(modelId);
  },
});

const OPENAI = defineProvider({
  id: 'openai',
  displayName: 'OpenAI (ChatGPT)',
  familyName: 'GPT',
  keyHint: 'sk-…',
  description: 'GPT-5.6 family + GPT-4o — strong tools, vision, embeddings.',
  pricingTier: 'medium',
  docsUrl: 'https://developers.openai.com/api/docs/models',
  baseURL: 'https://api.openai.com/v1',
  defaultModels: {
    fundamental: 'gpt-5.6-sol',
    technical: 'gpt-5.6-terra',
    summary: 'gpt-5.6-luna',
    vision: 'gpt-5.6-terra',
    embedding: 'text-embedding-3-small',
  },
  bestFor: 'General purpose + tools',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gpt-5.6-sol',
      label: 'GPT-5.6 Sol',
      description: 'Frontier model for complex reasoning and coding.',
      tier: 'flagship',
      // Standard (non-batch) list prices from OpenAI pricing docs.
      inputPerMTokUsd: 5,
      outputPerMTokUsd: 30,
      contextTokens: 1_050_000,
      capabilities: CAPS_FULL,
      released: '2026-02',
    },
    {
      modelId: 'gpt-5.6-terra',
      label: 'GPT-5.6 Terra',
      description: 'Balanced intelligence and cost — default workhorse.',
      tier: 'pro',
      inputPerMTokUsd: 2.5,
      outputPerMTokUsd: 15,
      contextTokens: 1_050_000,
      capabilities: CAPS_FULL,
      released: '2026-02',
    },
    {
      modelId: 'gpt-5.6-luna',
      label: 'GPT-5.6 Luna',
      description: 'Cost-sensitive high-volume workloads.',
      tier: 'lite',
      inputPerMTokUsd: 1,
      outputPerMTokUsd: 6,
      contextTokens: 1_050_000,
      capabilities: CAPS_FULL,
      released: '2026-02',
    },
    {
      modelId: 'gpt-5.6',
      label: 'GPT-5.6 (alias)',
      description: 'Alias for the current GPT-5.6 flagship line.',
      tier: 'flagship',
      inputPerMTokUsd: 5,
      outputPerMTokUsd: 30,
      contextTokens: 1_050_000,
      capabilities: CAPS_FULL,
      released: '2026-02',
    },
    {
      modelId: 'gpt-4o',
      label: 'GPT-4o',
      description: 'Previous multimodal flagship.',
      tier: 'pro',
      inputPerMTokUsd: 2.5,
      outputPerMTokUsd: 10,
      contextTokens: 128_000,
      capabilities: CAPS_FULL,
      released: '2024-08',
    },
    {
      modelId: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      description: 'Cheap, fast, multimodal.',
      tier: 'lite',
      inputPerMTokUsd: 0.15,
      outputPerMTokUsd: 0.6,
      contextTokens: 128_000,
      capabilities: CAPS_FULL,
      released: '2024-07',
    },
    {
      modelId: 'gpt-4.1',
      label: 'GPT-4.1',
      description: 'Long-context GPT-4.1 (still useful for 1M context).',
      tier: 'pro',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 8,
      contextTokens: 1_047_576,
      capabilities: CAPS_FULL,
      released: '2025-04',
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
  // OpenAI-compatible shim keeps us on one dep path; Responses-only
  // features can move to @ai-sdk/openai later without changing the registry shape.
  factory: openaiCompatibleFactory('openai', 'https://api.openai.com/v1'),
});

const GROQ = defineProvider({
  id: 'groq',
  displayName: 'Groq',
  familyName: 'Llama / GPT-OSS',
  keyHint: 'gsk_…',
  description: 'Groq inference — extremely fast open-weight models, free tier.',
  pricingTier: 'free',
  docsUrl: 'https://console.groq.com/docs/models',
  baseURL: 'https://api.groq.com/openai/v1',
  defaultModels: {
    fundamental: 'openai/gpt-oss-120b',
    technical: 'llama-3.3-70b-versatile',
    summary: 'llama-3.1-8b-instant',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    embedding: null,
  },
  bestFor: 'Ultra-low latency',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'openai/gpt-oss-120b',
      label: 'GPT-OSS 120B',
      description: 'OpenAI open-weight 120B on Groq LPUs (~500 t/s).',
      tier: 'flagship',
      inputPerMTokUsd: 0.15,
      outputPerMTokUsd: 0.6,
      contextTokens: 131_072,
      capabilities: CAPS_TEXT,
      released: '2025-08',
    },
    {
      modelId: 'openai/gpt-oss-20b',
      label: 'GPT-OSS 20B',
      description: 'Fast open-weight 20B (~1000 t/s).',
      tier: 'fast',
      inputPerMTokUsd: 0.075,
      outputPerMTokUsd: 0.3,
      contextTokens: 131_072,
      capabilities: CAPS_TEXT,
      released: '2025-08',
    },
    {
      modelId: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B Versatile',
      description: 'Strong open 70B, very fast on Groq.',
      tier: 'pro',
      inputPerMTokUsd: 0.59,
      outputPerMTokUsd: 0.79,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
      released: '2024-12',
    },
    {
      modelId: 'llama-3.1-8b-instant',
      label: 'Llama 3.1 8B Instant',
      description: 'Tiny, sub-second latency for titles/summaries.',
      tier: 'lite',
      inputPerMTokUsd: 0.05,
      outputPerMTokUsd: 0.08,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
      released: '2024-07',
    },
    {
      modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
      label: 'Llama 4 Scout 17B',
      description: 'Llama 4 multimodal Scout — vision + tools.',
      tier: 'pro',
      inputPerMTokUsd: 0.11,
      outputPerMTokUsd: 0.34,
      contextTokens: 128_000,
      capabilities: CAPS_FULL,
      released: '2025-04',
    },
    {
      modelId: 'qwen/qwen3.6-27b',
      label: 'Qwen3.6 27B',
      description: 'Strong open Qwen on Groq.',
      tier: 'pro',
      inputPerMTokUsd: 0.2,
      outputPerMTokUsd: 0.6,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
      released: '2026-03',
    },
  ],
  factory: openaiCompatibleFactory('groq', 'https://api.groq.com/openai/v1'),
});

const MISTRAL = defineProvider({
  id: 'mistral',
  displayName: 'Mistral AI',
  familyName: 'Mistral',
  keyHint: '…',
  description: 'Mistral Medium / Small / Pixtral — European host, strong tools + vision.',
  pricingTier: 'low',
  docsUrl: 'https://docs.mistral.ai/models/overview',
  baseURL: 'https://api.mistral.ai/v1',
  defaultModels: {
    fundamental: 'mistral-medium-latest',
    technical: 'mistral-small-latest',
    summary: 'ministral-8b-latest',
    vision: 'pixtral-large-latest',
    embedding: 'mistral-embed',
  },
  bestFor: 'EU host + coding',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'mistral-medium-latest',
      label: 'Mistral Medium (latest)',
      description: 'Frontier multimodal / agentic Medium line.',
      tier: 'flagship',
      inputPerMTokUsd: 0.4,
      outputPerMTokUsd: 2,
      contextTokens: 128_000,
      capabilities: CAPS_FULL,
      released: '2026-04',
    },
    {
      modelId: 'mistral-large-latest',
      label: 'Mistral Large (latest)',
      description: 'Large reasoning model, long context.',
      tier: 'flagship',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 6,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
      released: '2025-12',
    },
    {
      modelId: 'mistral-small-latest',
      label: 'Mistral Small (latest)',
      description: 'Cheap, fast hybrid instruct/reasoning/coding.',
      tier: 'fast',
      inputPerMTokUsd: 0.1,
      outputPerMTokUsd: 0.3,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
      released: '2026-03',
    },
    {
      modelId: 'pixtral-large-latest',
      label: 'Pixtral Large (vision)',
      description: 'Vision-capable Mistral.',
      tier: 'pro',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 6,
      contextTokens: 128_000,
      capabilities: CAPS_FULL,
      released: '2024-11',
    },
    {
      modelId: 'codestral-latest',
      label: 'Codestral',
      description: 'Code-specialised Mistral model.',
      tier: 'pro',
      inputPerMTokUsd: 0.3,
      outputPerMTokUsd: 0.9,
      contextTokens: 256_000,
      capabilities: CAPS_TEXT,
      released: '2025-08',
    },
    {
      modelId: 'ministral-8b-latest',
      label: 'Ministral 8B',
      description: 'Tiny edge model for summaries.',
      tier: 'lite',
      inputPerMTokUsd: 0.1,
      outputPerMTokUsd: 0.1,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
      released: '2025-12',
    },
    {
      modelId: 'mistral-embed',
      label: 'Mistral Embed',
      description: '1024-dim text embeddings.',
      tier: 'embedding',
      inputPerMTokUsd: 0.1,
      outputPerMTokUsd: null,
      contextTokens: 8_192,
      capabilities: {},
      released: '2023-12',
    },
  ],
  factory: openaiCompatibleFactory('mistral', 'https://api.mistral.ai/v1'),
});

const OPENROUTER = defineProvider({
  id: 'openrouter',
  displayName: 'OpenRouter',
  familyName: 'Any model',
  keyHint: 'sk-or-…',
  description: 'OpenRouter — one key for 100+ models from every provider.',
  pricingTier: 'medium',
  docsUrl: 'https://openrouter.ai/docs',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultModels: {
    fundamental: 'anthropic/claude-opus-4-8',
    technical: 'openai/gpt-5.6-terra',
    summary: 'google/gemini-2.5-flash-lite',
    vision: 'anthropic/claude-sonnet-5',
    embedding: 'openai/text-embedding-3-small',
  },
  bestFor: '100+ models, 1 key',
  supports: { vision: true, embedding: true },
  // Curated subset — OpenRouter supports hundreds more.
  models: [
    {
      modelId: 'anthropic/claude-opus-4-8',
      label: 'Claude Opus 4.8 (via OpenRouter)',
      description: 'Top Anthropic reasoning via OpenRouter.',
      tier: 'flagship',
      inputPerMTokUsd: 5,
      outputPerMTokUsd: 25,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'anthropic/claude-sonnet-5',
      label: 'Claude Sonnet 5 (via OpenRouter)',
      description: 'Balanced Claude via OpenRouter.',
      tier: 'pro',
      inputPerMTokUsd: 3,
      outputPerMTokUsd: 15,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'openai/gpt-5.6-terra',
      label: 'GPT-5.6 Terra (via OpenRouter)',
      description: 'OpenAI balanced flagship.',
      tier: 'flagship',
      inputPerMTokUsd: 2.5,
      outputPerMTokUsd: 15,
      contextTokens: 1_050_000,
      capabilities: CAPS_FULL,
      released: '2026-02',
    },
    {
      modelId: 'google/gemini-2.5-pro',
      label: 'Gemini 2.5 Pro (via OpenRouter)',
      description: 'Google reasoning, 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2025-04',
    },
    {
      modelId: 'google/gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite (via OpenRouter)',
      description: 'Cheap Google model for summaries.',
      tier: 'lite',
      inputPerMTokUsd: 0.1,
      outputPerMTokUsd: 0.4,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2025-07',
    },
    {
      modelId: 'openai/gpt-4o-mini',
      label: 'GPT-4o mini (via OpenRouter)',
      description: 'Cheap, fast, multimodal.',
      tier: 'lite',
      inputPerMTokUsd: 0.15,
      outputPerMTokUsd: 0.6,
      contextTokens: 128_000,
      capabilities: CAPS_FULL,
      released: '2024-07',
    },
    {
      modelId: 'meta-llama/llama-3.3-70b-instruct',
      label: 'Llama 3.3 70B (via OpenRouter)',
      description: 'Open-source 70B.',
      tier: 'fast',
      inputPerMTokUsd: 0.1,
      outputPerMTokUsd: 0.1,
      contextTokens: 128_000,
      capabilities: CAPS_TEXT,
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
  factory: openaiCompatibleFactory('openrouter', 'https://openrouter.ai/api/v1', {
    // OpenRouter ranking / app attribution headers (optional but recommended).
    'HTTP-Referer': 'https://hamafx.ai',
    'X-Title': 'HamaFX AI',
  }),
});

const XAI = defineProvider({
  id: 'xai',
  displayName: 'xAI (Grok)',
  familyName: 'Grok',
  keyHint: 'xai-…',
  description: 'Grok 4.5 / 4.3 — strong reasoning, tools, vision, large context.',
  pricingTier: 'medium',
  docsUrl: 'https://docs.x.ai/developers/models',
  baseURL: 'https://api.x.ai/v1',
  defaultModels: {
    fundamental: 'grok-4.5',
    technical: 'grok-4.3',
    summary: 'grok-4.3',
    vision: 'grok-4.5',
    embedding: null,
  },
  bestFor: 'Agentic tools + search',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'grok-4.5',
      label: 'Grok 4.5',
      description: 'Flagship Grok for code + agents. 500k context.',
      tier: 'flagship',
      inputPerMTokUsd: 2,
      outputPerMTokUsd: 6,
      contextTokens: 500_000,
      capabilities: CAPS_FULL,
      released: '2026-06',
    },
    {
      modelId: 'grok-4.3',
      label: 'Grok 4.3',
      description: 'Balanced Grok chat model. 1M context.',
      tier: 'pro',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 2.5,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'grok-4.20-0309-reasoning',
      label: 'Grok 4.20 Reasoning',
      description: 'Reasoning-tuned Grok 4.20 snapshot.',
      tier: 'pro',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 2.5,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-03',
    },
    {
      modelId: 'grok-4.20-0309-non-reasoning',
      label: 'Grok 4.20 Fast',
      description: 'Non-reasoning / lower-latency Grok 4.20.',
      tier: 'fast',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 2.5,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-03',
    },
  ],
  factory: openaiCompatibleFactory('xai', 'https://api.x.ai/v1'),
});

const DEEPSEEK = defineProvider({
  id: 'deepseek',
  displayName: 'DeepSeek',
  familyName: 'DeepSeek',
  keyHint: 'sk-…',
  description: 'DeepSeek V4 — strong reasoning at very low cost (1M context).',
  pricingTier: 'low',
  docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  // Official OpenAI-compatible base (docs: https://api.deepseek.com).
  baseURL: 'https://api.deepseek.com',
  defaultModels: {
    fundamental: 'deepseek-v4-pro',
    technical: 'deepseek-v4-flash',
    summary: 'deepseek-v4-flash',
    vision: null, // DeepSeek first-party API has no vision model as of mid-2026
    embedding: null,
  },
  bestFor: 'Cheap reasoning',
  supports: { vision: false, embedding: false },
  models: [
    {
      modelId: 'deepseek-v4-pro',
      label: 'DeepSeek V4 Pro',
      description: 'Best DeepSeek reasoning / agentic coding. 1M context.',
      tier: 'flagship',
      // Cache-miss list prices (conservative for budget estimates).
      inputPerMTokUsd: 0.435,
      outputPerMTokUsd: 0.87,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2026-03',
    },
    {
      modelId: 'deepseek-v4-flash',
      label: 'DeepSeek V4 Flash',
      description: 'Fast/cheap V4 with optional thinking mode. 1M context.',
      tier: 'pro',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2026-03',
    },
    // Deprecated aliases (retire 2026-07-24) kept so saved settings keep working.
    {
      modelId: 'deepseek-chat',
      label: 'DeepSeek Chat (alias → V4 Flash non-thinking)',
      description: 'Legacy alias. Prefer deepseek-v4-flash.',
      tier: 'fast',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2024-12',
    },
    {
      modelId: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner (alias → V4 Flash thinking)',
      description: 'Legacy alias. Prefer deepseek-v4-flash (thinking mode).',
      tier: 'flagship',
      inputPerMTokUsd: 0.14,
      outputPerMTokUsd: 0.28,
      contextTokens: 1_000_000,
      capabilities: CAPS_TEXT,
      released: '2025-01',
    },
  ],
  factory: openaiCompatibleFactory('deepseek', 'https://api.deepseek.com'),
});

const IAMHC = defineProvider({
  id: 'iamhc',
  displayName: 'IAMHC API',
  familyName: 'Aggregate',
  keyHint: 'sk-…',
  description:
    'IAMHC — aggregated API proxy with 25+ models across OpenAI, Anthropic, Gemini, and more.',
  pricingTier: 'low',
  baseURL: 'https://api.iamhc.cn/v1',
  defaultModels: {
    fundamental: 'DeepSeek-V4-Pro',
    technical: 'DeepSeek-V4-Flash',
    summary: 'Qwen3.6-35B-A3B',
    vision: 'Qwen3.5-397B-A17B',
    embedding: null,
  },
  bestFor: 'Multi-model proxy',
  supports: { vision: true, embedding: false },
  models: [
    {
      modelId: 'auto',
      label: 'Auto (routed)',
      description: 'Smart routing across all models.',
      tier: 'flagship',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'DeepSeek-V4-Pro',
      label: 'DeepSeek V4 Pro',
      description: 'Best reasoning model via proxy.',
      tier: 'flagship',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'DeepSeek-V4-Flash',
      label: 'DeepSeek V4 Flash',
      description: 'Fast balanced model.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'Qwen3.5-397B-A17B',
      label: 'Qwen 3.5 397B (MoE)',
      description: 'Strong reasoning, vision-capable.',
      tier: 'flagship',
      capabilities: CAPS_FULL,
    },
    {
      modelId: 'Qwen3.6-35B-A3B',
      label: 'Qwen 3.6 35B (MoE)',
      description: 'Fast light reasoning.',
      tier: 'lite',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'Kimi-K2.6',
      label: 'Kimi K2.6',
      description: 'Long context reasoning.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'MiniMax-M3',
      label: 'MiniMax M3',
      description: 'General purpose model.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
    {
      modelId: 'glm-4.7',
      label: 'GLM 4.7',
      description: 'ChatGLM series, Anthropic-compatible.',
      tier: 'pro',
      capabilities: CAPS_TEXT,
    },
  ],
  factory: openaiCompatibleFactory('iamhc', 'https://api.iamhc.cn/v1'),
});

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
  iamhc: IAMHC,
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

/**
 * Look up catalog pricing for a qualified model id (`provider/bare`)
 * or a bare Gemini id. Used by cost estimation so rates stay in sync
 * with the provider registry.
 */
export function lookupModelRate(
  modelId: string,
): { inputPerM: number; outputPerM: number } | null {
  let providerId: string | null = null;
  let bare = modelId;

  if (modelId.startsWith('google-vertex/')) {
    providerId = 'vertex';
    bare = modelId.slice('google-vertex/'.length);
  } else if (modelId.includes('/')) {
    const slash = modelId.indexOf('/');
    providerId = modelId.slice(0, slash);
    bare = modelId.slice(slash + 1);
    // OpenRouter embeds nested provider/model ids (e.g. openai/gpt-5.6-terra).
    if (providerId === 'openrouter') {
      // bare already includes nested path when callers pass openrouter/...
    }
  } else if (modelId.startsWith('gemini-') || modelId.startsWith('text-embedding-')) {
    providerId = 'google';
    bare = modelId;
  }

  if (!providerId || !(providerId in BYOK_PROVIDERS)) return null;
  const spec = BYOK_PROVIDERS[providerId as ProviderId];
  const match = spec.models.find((m) => m.modelId === bare);
  if (!match) return null;
  if (typeof match.inputPerMTokUsd !== 'number') return null;
  return {
    inputPerM: match.inputPerMTokUsd,
    outputPerM: typeof match.outputPerMTokUsd === 'number' ? match.outputPerMTokUsd : 0,
  };
}

/** Flatten catalog into qualified rates for cost.ts / telemetry. */
export function buildCatalogRateTable(): Record<string, { inputPerM: number; outputPerM: number }> {
  const out: Record<string, { inputPerM: number; outputPerM: number }> = {};
  for (const spec of BYOK_PROVIDERS_LIST) {
    for (const m of spec.models) {
      if (typeof m.inputPerMTokUsd !== 'number') continue;
      const output = typeof m.outputPerMTokUsd === 'number' ? m.outputPerMTokUsd : 0;
      out[`${spec.id}/${m.modelId}`] = {
        inputPerM: m.inputPerMTokUsd,
        outputPerM: output,
      };
    }
  }
  return out;
}
