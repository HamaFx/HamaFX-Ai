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

// BYOK provider registry — imports all provider specs and builds the public API.
// Individual provider definitions live in their own files under _providers/.

import { PROVIDER_IDS, type ProviderId } from '@hamafx/shared/byok';

import { GOOGLE } from './google';
import { VERTEX } from './vertex';
import { ANTHROPIC } from './anthropic';
import { OPENAI } from './openai';
import { GROQ, MISTRAL, OPENROUTER } from './groq-mistral-openrouter';
import { XAI, DEEPSEEK, IAMHC } from './xai-deepseek-iamhc';
import type { ByokProviderSpec, ModelDomain } from './types';

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
