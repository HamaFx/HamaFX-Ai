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

// P1-1 — Extracted from model.ts. Vision model resolution.
//
// Dependency: model-helpers.ts (parsePickedModelId, PROVIDER_PRIORITY,
// envFallbackKeys).

import type { LanguageModel } from 'ai';
import type { UserSettingsRow } from '@hamafx/db/schema';
import {
  decryptByok,
  configuredProviders,
  type ByokPayload,
  type ProviderId,
} from '@hamafx/shared/encryption';
import { BYOK_PROVIDERS } from './byok-providers';
import type { ResolveModelEnv } from './vertex-factory';
import {
  PROVIDER_PRIORITY,
  envFallbackKeys,
  parsePickedModelId,
} from './model-helpers';

/**
 * Phase D2 — result of resolving the user's "default vision model".
 * Used by `analyze_chart_image` and any other vision-capable tools.
 * Same shape as `ChatModelResolution` so callers can pass `.model`
 * straight into `generateText({ model })`.
 */
export interface VisionModelResolution {
  model: LanguageModel;
  /** Qualified id "google-vertex/gemini-2.5-pro". */
  modelId: string;
  providerId: ProviderId;
  bareModelId: string;
}

/**
 * Resolve the user's default vision model.
 *
 * Decision tree:
 *   1. If `userSettings.visionModel` is set + valid (provider supports
 *      vision AND model is in the spec catalog) → use it.
 *   2. Else pick the highest-priority configured provider's
 *      `spec.defaultModels.vision`. (Vision is a rarer capability
 *      than chat; if the user's primary BYOK doesn't declare a vision
 *      model, the resolver falls back to the next configured provider.)
 *   3. Else throw.
 *
 * Note: a user with Google + Anthropic keys (no Vertex) can still
 * pick `google-vertex:gemini-2.5-pro` for vision even though their
 * chat model is Anthropic. The pick is independent.
 *
 * Phase D2 — AI_VISION_MODEL env var was removed. Operators no
 * longer override the vision model; BYOK users own this choice.
 * (Embedding still has AI_EMBEDDING_MODEL as the gateway fallback
 * because embeddings are cross-vendor via OpenAI's embedding API.)
 */
export function resolveVisionModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'visionModel'>,
  env: ResolveModelEnv,
): VisionModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const keys: ByokPayload = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };

  // 1. User's explicit pick.
  if (typeof userSettings.visionModel === 'string' && userSettings.visionModel.length > 0) {
    const parsed = parsePickedModelId(userSettings.visionModel, keys);
    if (parsed && parsed.spec.supports.vision) {
      return {
        model: parsed.spec.factory(parsed.apiKey)(parsed.bareModelId),
        modelId: `${parsed.spec.id}/${parsed.bareModelId}`,
        providerId: parsed.providerId,
        bareModelId: parsed.bareModelId,
      };
    }
    // Fall through silently on invalid pick — same UX as chat.
  }

  // 2. Highest-priority configured provider that declares a vision model.
  const priority = configuredProviders(keys).slice().sort(
    (a, b) => PROVIDER_PRIORITY.indexOf(a) - PROVIDER_PRIORITY.indexOf(b),
  );
  for (const providerId of priority) {
    const spec = BYOK_PROVIDERS[providerId];
    if (!spec?.supports.vision) continue;
    const vision = spec.defaultModels.vision;
    if (!vision) continue;
    const apiKey = keys[providerId];
    if (typeof apiKey !== 'string' || apiKey.length === 0) continue;
    return {
      model: spec.factory(apiKey)(vision),
      modelId: `${spec.id}/${vision}`,
      providerId,
      bareModelId: vision,
    };
  }

  throw new Error(
    'No vision-capable model available. Add a key for a provider that supports vision ' +
      '(e.g. Google, Vertex, Anthropic, OpenAI, Mistral) in Settings → API Keys, ' +
      'or pick one in Settings → Models → Advanced.',
  );
}
