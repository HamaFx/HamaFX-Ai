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

// P1-1 — Extracted from model.ts. Embedding model resolution.
//
// Dependency: model-helpers.ts (parsePickedModelId, PROVIDER_PRIORITY,
// envFallbackKeys).

import type { UserSettingsRow } from '@hamafx/db/schema';
import {
  decryptByok,
  configuredProviders,
  type ByokPayload,
} from '@hamafx/shared/encryption';
import { BYOK_PROVIDERS } from './byok-providers';
import type { ResolveModelEnv } from './vertex-factory';
import {
  PROVIDER_PRIORITY,
  envFallbackKeys,
  parsePickedModelId,
} from './model-helpers';

/**
 * Phase D2 — result of resolving the user's default embedding model.
 * Returns the qualified model id string only (e.g.
 * `"openai/text-embedding-3-small"`) — embeddings don't go through
 * the BYOK factory path because the AI SDK's `embedMany` handles
 * provider routing by id prefix when a gateway key is configured.
 */
export type EmbeddingModelResolution = string;

/**
 * Resolve the user's default embedding model.
 *
 * Decision tree:
 *   1. If `userSettings.embeddingModel` is set + valid → use it.
 *   2. Else if `env.AI_EMBEDDING_MODEL` is set (operator override) →
 *      use it. The default is `openai/text-embedding-3-small` which
 *      routes through the AI Gateway.
 *   3. Else pick the highest-priority configured provider's
 *      `spec.defaultModels.embedding`.
 *   4. Else return the hardcoded universal default
 *      `openai/text-embedding-3-small` (works across providers via
 *      the AI Gateway; OpenAI's text-embedding-3-small has the
 *      widest cross-vendor compatibility).
 */
export function resolveEmbeddingModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'embeddingModel'>,
  env: ResolveModelEnv,
): EmbeddingModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const keys: ByokPayload = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };

  // 1. User's explicit pick.
  if (
    typeof userSettings.embeddingModel === 'string' &&
    userSettings.embeddingModel.length > 0
  ) {
    const parsed = parsePickedModelId(userSettings.embeddingModel, keys);
    if (parsed && parsed.spec.supports.embedding) {
      return `${parsed.spec.id}/${parsed.bareModelId}`;
    }
    // Fall through silently on invalid pick — same UX as chat/vision.
  }

  // 2. Operator-set env fallback.
  if (typeof env.AI_EMBEDDING_MODEL === 'string' && env.AI_EMBEDDING_MODEL.length > 0) {
    return env.AI_EMBEDDING_MODEL;
  }

  // 3. Highest-priority configured provider that declares an embedding model.
  const priority = configuredProviders(keys).slice().sort(
    (a, b) => PROVIDER_PRIORITY.indexOf(a) - PROVIDER_PRIORITY.indexOf(b),
  );
  for (const providerId of priority) {
    const spec = BYOK_PROVIDERS[providerId];
    if (!spec?.supports.embedding) continue;
    const embedding = spec.defaultModels.embedding;
    if (!embedding) continue;
    return `${spec.id}/${embedding}`;
  }

  // 4. Universal default — works via AI Gateway to OpenAI's embedding API.
  return 'openai/text-embedding-3-small';
}
