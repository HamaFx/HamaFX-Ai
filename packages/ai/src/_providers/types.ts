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

// BYOK provider type definitions. Shared between the provider registry and individual
// provider spec files to avoid circular imports.

import type { LanguageModel } from 'ai';
import type { ProviderId } from '@hamafx/shared/byok';

/** The five "domains" the agent routes between (see packages/ai/src/routing.ts). */
export type ModelDomain = 'fundamental' | 'technical' | 'summary' | 'vision' | 'embedding';

/**
 * Rich metadata for a single model. Surfaced to the UI so the user
 * can compare models across providers without leaving /settings/models.
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
  /** Full per-model catalog. */
  models: ModelSpec[];
  /** Build a (modelId) => LanguageModel from this provider's API key. */
  factory: (apiKey: string) => (modelId: string) => LanguageModel;
  /** Short tag describing what this provider is best suited for. */
  bestFor?: string;
  /** Capability flags the UI uses to filter/label providers. */
  supports: {
    vision: boolean;
    embedding: boolean;
  };
  /** Optional OpenAI-compatible base URL. */
  baseURL?: string;
  /** Optional docs URL for operators / settings UI. */
  docsUrl?: string;
}
