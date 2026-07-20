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

// P1-1 — Extracted from model.ts. Pure utility functions and constants
// with no domain logic dependencies. Used by all model resolver modules.
//
// Dependency: none (leaf module — no imports from other model-* files).

import type { ByokPayload, ProviderId } from '@hamafx/shared/encryption';
import { PROVIDER_IDS } from '@hamafx/shared/byok';
import { BYOK_PROVIDERS } from './byok-providers';
import type { ResolveModelEnv } from './vertex-factory';

/**
 * Provider priority when multiple keys are configured — higher index wins for default. */
export const PROVIDER_PRIORITY: ProviderId[] = [
  // Premium: prefer the strongest reasoning model when configured.
  'google',
  'vertex',
  'anthropic',
  'openai',
  // Aggregators / alt providers.
  'openrouter',
  'xai',
  'mistral',
  'groq',
  'deepseek',
  'iamhc',
];

/**
 * Surface operator-provided AI keys (env vars) as a synthetic BYOK payload.
 *
 * @internal — exported for use by sibling resolver modules only.
 * The actual BYOK storage takes precedence when both are set, but if the
 * user hasn't gone through onboarding yet, this gives single-tenant
 * deployments a working chat out of the box.
 *
 * Currently surfaces Google (direct Gemini API). Vertex + AI Gateway
 * paths are handled by `resolveModel()` (the env-only resolver) — that
 * is a different code path and doesn't use BYOK.
 */
export function envFallbackKeys(env: ResolveModelEnv): ByokPayload {
  const out: ByokPayload = {};
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    out.google = env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
  // Prefer explicit GOOGLE_APPLICATION_CREDENTIALS_JSON for Vertex BYOK.
  // Path-based GOOGLE_APPLICATION_CREDENTIALS is handled by the Vertex
  // SDK via process.env for `google-vertex/...` gateway-style ids, but
  // BYOK factories need the JSON body itself.
  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    out.vertex = env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  }
  // Optional operator env keys (common self-host names). Only populate
  // when present so we never invent empty credentials.
  const processEnv = typeof process !== 'undefined' ? process.env : undefined;
  if (processEnv) {
    const map: Array<[keyof ByokPayload, string]> = [
      ['anthropic', 'ANTHROPIC_API_KEY'],
      ['openai', 'OPENAI_API_KEY'],
      ['groq', 'GROQ_API_KEY'],
      ['mistral', 'MISTRAL_API_KEY'],
      ['openrouter', 'OPENROUTER_API_KEY'],
      ['xai', 'XAI_API_KEY'],
      ['deepseek', 'DEEPSEEK_API_KEY'],
      ['iamhc', 'IAMHC_API_KEY'],
    ];
    for (const [field, envName] of map) {
      const val = processEnv[envName];
      if (typeof val === 'string' && val.length > 0) {
        out[field] = val;
      }
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// PERF-4 — Prompt caching capability detection.
//
// Anthropic supports explicit cache_control markers on the system prefix
// via providerOptions, giving ~90% cost reduction on repeated prompts.
// OpenAI-compatible providers do automatic prefix caching without markers.
// Google/Vertex use a different context-caching API (not used here).
// ───────────────────────────────────────────────────────────────────────

/** Returns true when the resolved model supports explicit cache markers. */
export function supportsPromptCaching(modelId: string): boolean {
  return modelId.includes('anthropic');
}

// ───────────────────────────────────────────────────────────────────────
// Internal helpers (exported for sibling resolver modules only).
// ───────────────────────────────────────────────────────────────────────

/**
 * Internal helper — parse a stored "<providerId>:<bareModelId>" string
 * and verify it's resolvable with the merged BYOK payload. Returns the
 * validated provider spec + apiKey + bareModelId on success, or null
 * on any validation failure. Shared between chat / vision / embedding
 * resolvers so the parse + verify logic stays in one place.
 *
 * @internal — exported for use by sibling resolver modules only.
 */
export function parsePickedModelId(
  value: string,
  keys: ByokPayload,
): { providerId: ProviderId; bareModelId: string; spec: typeof BYOK_PROVIDERS[ProviderId]; apiKey: string } | null {
  const sep = value.indexOf(':');
  if (sep < 0) return null;
  const providerIdRaw = value.slice(0, sep);
  const bareModelId = value.slice(sep + 1);
  if (!PROVIDER_IDS.includes(providerIdRaw as ProviderId)) return null;
  const providerId = providerIdRaw as ProviderId;
  const apiKey = keys[providerId];
  if (typeof apiKey !== 'string' || apiKey.length === 0) return null;
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) return null;
  const known = (spec.models ?? []).some(
    (m: { modelId: string }) => m.modelId === bareModelId,
  );
  if (!known) return null;
  return { providerId, bareModelId, spec, apiKey };
}
