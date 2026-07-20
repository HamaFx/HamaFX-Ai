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

// P1-1 — Extracted from model.ts. Chat model resolution: resolveChatModel,
// resolveModelForProvider, derivePlannerModel, and deriveTitleModel.
//
// Dependency: model-helpers.ts (PROVIDER_PRIORITY, envFallbackKeys,
// parsePickedModelId).

import type { LanguageModel } from 'ai';
import type { UserSettingsRow } from '@hamafx/db/schema';
import {
  decryptByok,
  configuredProviders,
  type ByokPayload,
  type ProviderId,
} from '@hamafx/shared/encryption';
import { PROVIDER_IDS } from '@hamafx/shared/byok';
import { isCircuitOpen } from './model-circuit-breaker';
import { BYOK_PROVIDERS } from './byok-providers';
import type { ModelDomain } from './byok-providers';
import type { ResolveModelEnv } from './vertex-factory';
import {
  PROVIDER_PRIORITY,
  envFallbackKeys,
  parsePickedModelId,
} from './model-helpers';

// -----------------------------------------------------------------------
// Phase F — single-model resolution
// -----------------------------------------------------------------------

/**
 * Result of resolving the user's "default chat model" — the single
 * model that handles every main chat turn unless overridden per-thread
 * via `resolveOverrideModel`.
 *
 * `model` is the AI-SDK `LanguageModel` instance ready to pass to
 * `streamText` / `generateText`. `modelId` is the qualified
 * `"<provider>/<bare>"` string used for telemetry and cost attribution.
 * `providerId` and `bareModelId` are split out so callers don't have
 * to re-parse the modelId.
 */
export interface ChatModelResolution {
  model: LanguageModel;
  /** Qualified id "google-vertex/gemini-2.5-pro". */
  modelId: string;
  providerId: ProviderId;
  bareModelId: string;
}

/**
 * Resolve the user's single default chat model.
 *
 * Decision tree:
 *   1. If `userSettings.chatModel` is set, parse it as
 *      `"<providerId>:<bareModelId>"` and verify both are known.
 *   2. Else fall back to the highest-priority configured provider's
 *      `spec.defaultModels.technical`.
 *
 * The merged BYOK payload (decrypted + env fallback) determines
 * which providers are "configured". The picked provider must have
 * a key — otherwise we throw a clear error pointing at the UI.
 *
 * This replaces the previous per-domain `defaultModels` lookup in
 * the chat path. The legacy JSONB column is still in the schema
 * (consumed by convene-committee for per-role picks) but no UI
 * surface mutates it any more.
 */
export function resolveChatModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
  /** Optional routing domain — picks the matching tier from defaultModels
   *  (fundamental→pro, technical→fast, summary→cheapest, etc.). Defaults to
   *  'technical' when omitted (backward-compatible). Ignored when the user
   *  has an explicit chatModel override set. */
  domain?: ModelDomain,
): ChatModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const hasStoredKeys = stored && Object.keys(stored).length > 0;
  // When a user has explicitly stored API keys in their settings, use ONLY
  // those keys — don't include system-level env fallback keys. The env
  // fallback (e.g. Google Vertex from server env vars) is a safety net for
  // users who haven't configured their own key yet. Once a user has chosen
  // a provider, that choice should be respected.
  const keys: ByokPayload = hasStoredKeys
    ? stored
    : { ...envFallbackKeys(env), ...(stored ?? {}) };
  const configured = configuredProviders(keys);
  if (configured.length === 0) {
    throw new Error(
      'No AI API keys configured. Add a provider key in Settings → API Keys, ' +
        'or visit /onboarding to walk through the setup wizard.',
    );
  }

  // Honor the user's explicit pick if present and valid.
  if (typeof userSettings.chatModel === 'string' && userSettings.chatModel.length > 0) {
    const value = userSettings.chatModel;
    const sep = value.indexOf(':');
    if (sep >= 0) {
      const providerIdRaw = value.slice(0, sep);
      const bareModelId = value.slice(sep + 1);
      if (PROVIDER_IDS.includes(providerIdRaw as ProviderId)) {
        const providerId = providerIdRaw as ProviderId;
        const apiKey = keys[providerId];
        if (typeof apiKey === 'string' && apiKey.length > 0) {
          const spec = BYOK_PROVIDERS[providerId];
          if (spec) {
            // The bare model id is checked against the spec's full
            // catalog so a typo in the stored value fails loud instead
            // of silently picking the provider's technical default.
            const known = (spec.models ?? []).some(
              (m: { modelId: string }) => m.modelId === bareModelId,
            );
            if (known) {
              // M4 fix — check circuit breaker even for explicit picks.
              if (isCircuitOpen(providerId)) {
                // Fall through to priority-loop fallback rather than
                // using a degraded provider.
              } else {
                return {
                  model: spec.factory(apiKey)(bareModelId),
                  modelId: `${spec.id}/${bareModelId}`,
                  providerId,
                  bareModelId,
                };
              }
            }
          }
        }
      }
    }
    // Invalid stored value — fall through to spec defaults below
    // rather than throwing. Logging would be useful here in future.
  }

  // No explicit pick: use the priority-ordered first configured
  // provider's model for the requested domain. Defaults to 'technical'
  // when no domain is specified (backward-compatible).
  const tier: ModelDomain = domain ?? 'technical';
  const priority = configured.slice().sort(
    (a, b) => PROVIDER_PRIORITY.indexOf(a) - PROVIDER_PRIORITY.indexOf(b),
  );

  // M4 (RELIABILITY_AUDIT_REPORT.md) — skip providers whose circuit is
  // open (3+ consecutive failures within 60s window). Falls through to
  // the next-priority provider.
  let providerId: ProviderId | undefined;
  for (const p of priority) {
    if (!isCircuitOpen(p)) {
      providerId = p;
      break;
    }
  }
  if (!providerId) {
    throw new Error('No configured provider available (all circuits are open).');
  }
  const spec = BYOK_PROVIDERS[providerId];
  const apiKey = keys[providerId]!;
  const bareModelId = spec.defaultModels[tier];
  if (!bareModelId) {
    throw new Error(
      `Provider ${providerId} has no default ${tier} model configured.`,
    );
  }
  return {
    model: spec.factory(apiKey)(bareModelId),
    modelId: `${spec.id}/${bareModelId}`,
    providerId,
    bareModelId,
  };
}

/**
 * Resolve a model specifically for a given provider ID.
 *
 * M4 fix — checks the circuit breaker before returning. If the
 * requested provider's circuit is open (3+ consecutive failures),
 * the caller gets a clear error rather than silently hitting a
 * degraded provider.
 */
export function resolveModelForProvider(
  providerId: ProviderId,
  userSettings: Pick<UserSettingsRow, 'aiApiKeys'>,
  env: ResolveModelEnv,
): ChatModelResolution {
  if (isCircuitOpen(providerId)) {
    throw new Error(
      `Provider ${providerId} is temporarily unavailable (circuit open).`,
    );
  }
  const stored = decryptByok(userSettings.aiApiKeys);
  const keys: ByokPayload = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };
  const apiKey = keys[providerId];
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${providerId}`);
  }
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const bareModelId = spec.defaultModels.technical;
  if (!bareModelId) {
    throw new Error(
      `Provider ${providerId} has no default technical model configured.`,
    );
  }
  return {
    model: spec.factory(apiKey)(bareModelId),
    modelId: `${spec.id}/${bareModelId}`,
    providerId,
    bareModelId,
  };
}

/**
 * Pick the model the plan-then-act planner should use. The planner
 * runs a cheap pre-step for every fundamental/technical turn, so we
 * want a small/cheap model from the same provider as the user's chat.
 *
 * Logic:
 *   - Use the user's chat provider's `spec.defaultModels.summary`
 *     (e.g. claude-haiku for Anthropic, flash-lite for Google).
 *   - If the chat provider has no summary declared, fall back to the
 *     chat model itself (cheapest available is the one we have).
 *   - If `userSettings.chatModel` is unset (fallback path used), the
 *     resolver already chose the right provider's `technical`, so the
 *     same summary-derivation applies.
 *   - If everything fails (no summary, no chat provider), returns
 *     null so the caller can use `AI_DEFAULT_MODEL` instead.
 */
export function derivePlannerModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): string | null {
  try {
    const chat = resolveChatModel(userSettings, env);
    const spec = BYOK_PROVIDERS[chat.providerId];
    const summary = spec?.defaultModels.summary;
    if (summary) {
      return `${chat.providerId}/${summary}`;
    }
    return chat.modelId;
  } catch {
    return null;
  }
}

/**
 * Pick the model title generation should use. Title is a tiny
 * 3-7-word summary call — same cheap-model preference as the
 * planner. Currently identical to `derivePlannerModel`; kept as a
 * separate symbol so future tuning (e.g. "title should be even
 * cheaper than the planner") doesn't fork the planner path.
 */
export function deriveTitleModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>,
  env: ResolveModelEnv,
): string | null {
  return derivePlannerModel(userSettings, env);
}
