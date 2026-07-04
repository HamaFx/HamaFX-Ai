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

// Plain BYOK types — no node:crypto, no `server-only` import. Re-exported
// from `@hamafx/shared/encryption` for backwards compatibility with code
// that already imports them from there.
//
// Keeping the types in their own file lets test files (which run in plain
// Node, not a server-component bundler) reference the provider list
// without tripping the server-only guard.

export const PROVIDER_IDS = [
  'google',
  'vertex',
  'anthropic',
  'openai',
  'groq',
  'mistral',
  'openrouter',
  'xai',
  'deepseek',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ByokPayload {
  google?: string;
  /**
   * Vertex AI service-account JSON, raw (the whole service-account
   * key file). Required fields: `client_email`, `private_key`. We
   * validate the shape at write time in `testProviderKey` and again
   * at every read in `getVertex`.
   *
   * Distinct from `google` (the public Gemini API) because Vertex uses
   * GCP service-account auth rather than an API key, and the model
   * factory is different (`@ai-sdk/google-vertex` vs `@ai-sdk/google`).
   */
  vertex?: string;
  anthropic?: string;
  openai?: string;
  groq?: string;
  mistral?: string;
  openrouter?: string;
  xai?: string;
  deepseek?: string;
  finnhub?: string;
  twelvedata?: string;
}

/**
 * Pricing tier for a provider — used by the UI to group free vs paid
 * cards and show appropriate cost hints.
 */
export type ProviderPricingTier = 'free' | 'low' | 'medium' | 'high';

/**
 * Client-safe subset of the runtime `ByokProviderSpec` from
 * `@hamafx/ai`. Stripped of `factory` (function — can't cross the
 * RSC server→client boundary) and `defaultModels` (server-only
 * defaults — only the agent needs them). The server component
 * projects the full spec into this shape before passing props.
 *
 * Keep this in sync with the prop types accepted by client
 * components (ApiKeyCard, OnboardingWizard provider picker).
 */
export interface ProviderMeta {
  id: ProviderId;
  displayName: string;
  familyName: string;
  keyHint: string;
  description: string;
  pricingTier: ProviderPricingTier;
  /**
   * Phase E — per-domain defaults already applied with user overrides
   * server-side in the catalog endpoint; surfaced as-is here.
   * Keys: fundamental, technical, summary, vision, embedding. Values
   * are bare model ids (no provider prefix).
   */
  defaultModels: {
    fundamental: string | null;
    technical: string | null;
    summary: string | null;
    vision: string | null;
    embedding: string | null;
  };
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 16. Short tag describing
   * what the provider is best suited for, shown in the
   * onboarding tooltip and api-keys card.
   */
  bestFor?: string;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 16. Capability flags so
   * the UI can label providers by what they support.
   */
  supports: {
    vision: boolean;
    embedding: boolean;
  };
  /** Phase E — full per-model catalog. */
  models: CatalogModel[];
  /** Whether the user has saved a key for this provider. */
  hasKey: boolean;
  /** Latest health snapshot for this provider (from provider_tests). */
  health: { ok: boolean; error: string | null; testedAt: string } | null;
}

/** Single model entry in the catalog response. */
export interface CatalogModel {
  /** Fully-qualified id used by resolveOverrideModel + AI SDK paths. */
  id: string;
  /** Provider this model belongs to. */
  providerId: ProviderId;
  /** Bare model id (no provider prefix). */
  modelId: string;
  /** Short label shown in the picker. */
  label?: string;
  /** One-line description shown in the expanded row. */
  description?: string;
  /** USD per 1M input tokens. null = free or unknown. */
  inputPerMTokUsd?: number | null;
  /** USD per 1M output tokens. null = free or unknown. */
  outputPerMTokUsd?: number | null;
  /** Context window in tokens. */
  contextTokens?: number;
  /** Per-model capability flags. */
  capabilities?: {
    vision?: boolean;
    tools?: boolean;
    jsonMode?: boolean;
    streaming?: boolean;
  };
  /** Friendly release date. */
  released?: string;
  /** Tier tag for sorting. */
  tier?: 'flagship' | 'pro' | 'fast' | 'lite' | 'embedding';
  /** Which domain this model is the default for, if any. */
  defaultFor?: ModelDomain;
}

/** Full /api/settings/catalog response. */
export interface CatalogResponse {
  domains: Array<{
    id: ModelDomain;
    label: string;
    description: string;
  }>;
  providers: ProviderMeta[];
  total: number;
  totalModels: number;
}

/**
 * The five domains used in the per-provider spec catalog. Phase F
 * collapsed the user-facing model picker to a single chat_model
 * (`user_settings.chat_model`), so `ModelDomain` no longer drives any
 * UI surface — it only labels which spec.defaultModels slot a
 * particular model fills (e.g. `defaultFor: 'technical'`).
 */
export type ModelDomain = 'fundamental' | 'technical' | 'summary' | 'vision' | 'embedding';