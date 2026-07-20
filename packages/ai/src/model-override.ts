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

// P1-1 — Extracted from model.ts. Explicit model override resolution
// for the "Regenerate with…" popover in the chat surface.
//
// Dependency: model-helpers.ts (PROVIDER_PRIORITY, envFallbackKeys).

import type { LanguageModel } from 'ai';
import type { UserSettingsRow } from '@hamafx/db/schema';
import {
  decryptByok,
  type ByokPayload,
  type ProviderId,
} from '@hamafx/shared/encryption';
import { PROVIDER_IDS } from '@hamafx/shared/byok';
import { BYOK_PROVIDERS } from './byok-providers';
import type { ResolveModelEnv } from './vertex-factory';
import { envFallbackKeys } from './model-helpers';

// -----------------------------------------------------------------------
// Phase B — UX_UPGRADE_PLAN.md item 8.
//
// Explicit model override resolution. The user picks a provider from
// the "Regenerate with…" popover in the chat surface; the value
// arrives here as either "provider:model" or "provider". We look up
// the BYOK key, instantiate the model through the provider factory,
// and return a LanguageModel ready for streamText.
//
// The function returns null when:
//   - The provider id is unknown.
//   - The provider is configured but has no model for the requested
//     id (e.g. "openai:claude-sonnet" — wrong prefix).
//   - No BYOK key is stored for the provider. Callers should fall
//     back to the default model in that case (handled at the
//     route layer, not here).
// -----------------------------------------------------------------------

export interface OverrideResolution {
  model: LanguageModel;
  /** Provider id + model id joined with a slash — what the model
   *  resolver returns for cost estimation + telemetry. */
  modelId: string;
  /** Provider id alone — handy for the fallback marker so the UI
   *  can show which provider failed. */
  providerId: ProviderId;
}

/**
 * Parse an override string of the form `provider:model` (or just
 * `provider`) and return the resolved LanguageModel.
 *
 * Examples:
 *   "anthropic"               → provider's default technical model
 *   "anthropic:claude-sonnet-4-20250514" → that exact model
 *   "openai/gpt-4o"           → gateway-style id (passed through to
 *                               streamText unchanged)
 *
 * The gateway-style "openai/gpt-4o" form is a special case: we don't
 * try to instantiate a model from BYOK, we return null so the
 * caller falls back to the default model. The streamText call will
 * then route through the AI Gateway if AI_GATEWAY_API_KEY is set.
 */
export function resolveOverrideModel(args: {
  override: string;
  userSettings: Pick<UserSettingsRow, 'aiApiKeys'>;
  env: ResolveModelEnv;
}): OverrideResolution | null {
  const { override, userSettings, env } = args;
  if (!override || override.length === 0) return null;

  // Gateway-style id — "openai/gpt-4o". The slash, not the colon, is
  // the marker. We don't try to resolve via BYOK; the gateway
  // path handles this elsewhere.
  if (override.includes('/')) return null;

  // Parse "provider" or "provider:model".
  const colon = override.indexOf(':');
  const providerIdRaw = colon === -1 ? override : override.slice(0, colon);
  const modelIdRaw = colon === -1 ? null : override.slice(colon + 1);

  // Verify the provider id is one we know.
  if (!PROVIDER_IDS.includes(providerIdRaw as ProviderId)) return null;
  const providerId = providerIdRaw as ProviderId;

  // Merge BYOK with operator env. Same precedence as the
  // auto-routing path: a user-saved key wins.
  const stored = decryptByok(userSettings.aiApiKeys);
  const merged: ByokPayload = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };
  const apiKey = merged[providerId];
  if (typeof apiKey !== 'string' || apiKey.length === 0) return null;

  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) return null;

  // Resolve the model id. If the user supplied one explicitly, use
  // it; otherwise fall back to the provider's default technical
  // model. We deliberately default to 'technical' (not the
  // routing domain) because the override is an explicit user
  // choice that bypasses the auto-router.
  const modelId =
    modelIdRaw && modelIdRaw.length > 0
      ? modelIdRaw
      : spec.defaultModels.technical;

  if (!modelId) return null;

  return {
    model: spec.factory(apiKey)(modelId),
    modelId: `${spec.id}/${modelId}`,
    providerId,
  };
}
