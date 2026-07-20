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

// Model resolver: maps a model id string to whatever the AI SDK v5 needs to
// route the call.
//
// SRP (architecture-audit/02): This module was split from an 800-line God
// module into focused sub-modules. Vertex AI client creation + resolveModel
// lives in `./vertex-factory.ts`; provider key testing lives in
// `./provider-tester.ts`. This file keeps domain-model routing, BYOK
// resolution, and override resolution.
//
// Pattern: Factory + Strategy (architecture-audit/08). The `MODEL_ROUTER`
// record implements the Strategy pattern, `resolveChatModel`/`resolveVisionModel`
// are Factory methods that return `LanguageModel` instances.

import type { LanguageModel } from 'ai';
import { resolveModel, getVertexGoogleSearchTool, type ResolveModelEnv } from './vertex-factory';
import { testProviderKey } from './provider-tester';

import {
  decryptByok,
  configuredProviders,
  type ByokPayload,
  type ProviderId,
} from '@hamafx/shared/encryption';
import type { UserSettingsRow } from '@hamafx/db/schema';

import {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  defaultModelFor,
  type ByokProviderSpec,
  type ModelDomain,
} from './byok-providers';
import { isCircuitOpen } from './model-circuit-breaker';
import { PROVIDER_IDS } from '@hamafx/shared/byok';

/**
 * Provider priority when multiple keys are configured — higher index wins for default. */
const PROVIDER_PRIORITY: ProviderId[] = [
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
 * The actual BYOK storage takes precedence when both are set, but if the
 * user hasn't gone through onboarding yet, this gives single-tenant
 * deployments a working chat out of the box.
 *
 * Currently surfaces Google (direct Gemini API). Vertex + AI Gateway
 * paths are handled by `resolveModel()` (the env-only resolver) — that
 * is a different code path and doesn't use BYOK.
 */
function envFallbackKeys(env: ResolveModelEnv): ByokPayload {
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

// Re-export extracted modules for backward compatibility.
export { testProviderKey } from './provider-tester';
export { resolveModel, getVertexGoogleSearchTool, type ResolveModelEnv } from './vertex-factory';

// Re-export the registry helpers for downstream callers.
export { BYOK_PROVIDERS, BYOK_PROVIDERS_LIST, defaultModelFor };
export type { ModelDomain, ByokProviderSpec };

// -----------------------------------------------------------------------
// PF-03 — Domain-based model routing via strategy map.
//
// Replaces the previous if/else chain in model selection with an
// open-for-extension, closed-for-modification strategy map.
// Adding a new domain means adding a strategy entry — the
// dispatch function `routeTurn()` stays unchanged.
// -----------------------------------------------------------------------

/** Context passed to each domain routing strategy. */
export interface DomainRoutingContext {
  userSettings: Pick<UserSettingsRow, 'aiApiKeys' | 'chatModel'>;
  env: ResolveModelEnv;
}

/**
 * A strategy that resolves a LanguageModel for a given domain.
 * Each strategy is a self-contained unit that knows how to pick
 * the right model tier for its domain.
 */
export interface DomainRoutingStrategy {
  /** Human-readable description for telemetry / debugging. */
  description: string;
  /** Resolve the model for this domain. */
  resolve: (ctx: DomainRoutingContext) => ChatModelResolution;
}

/**
 * Strategy map — domain → model resolution strategy.
 *
 * Every chat-routable domain has an entry here. Adding a new domain
 * (e.g., `sentiment`) requires adding an entry to this map — the
 * dispatch function remains unchanged (OCP compliance).
 *
 * Each strategy calls `resolveChatModel` with the appropriate
 * domain tier, which lets the BYOK provider system pick the
 * user's preferred model for that capability tier.
 */
export const MODEL_ROUTER: Record<ModelDomain, DomainRoutingStrategy> = {
  fundamental: {
    description: 'Uses the strongest reasoning model — macro/news/catalyst analysis.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'fundamental'),
  },
  technical: {
    description: 'Uses the mid-tier model — chart/indicator/structure analysis.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'technical'),
  },
  summary: {
    description: 'Uses the cheapest/lite model — recaps, summaries, listings.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'summary'),
  },
  vision: {
    description: 'Uses a vision-capable model — image/chart analysis.',
    resolve: (ctx) => resolveChatModel(ctx.userSettings, ctx.env, 'vision'),
  },
  embedding: {
    description: 'Embedding resolution — use resolveEmbeddingModel() instead.',
    resolve: () => {
      throw new Error(
        'MODEL_ROUTER.embedding is not supported. Use resolveEmbeddingModel() for embedding model resolution.',
      );
    },
  },
};

/**
 * Map ModelTier → ModelDomain for the multi-agent system.
 * Replaces the switch statement in base-agent.ts with a lookup map.
 */
export const TIER_TO_DOMAIN: Record<string, ModelDomain> = {
  fast: 'summary' as const,
  mid: 'technical' as const,
  strong: 'fundamental' as const,
};

/**
 * Resolve a model for a given domain using the MODEL_ROUTER strategy map.
 *
 * This is the primary entry point for domain-based model selection.
 * It replaces the previous if/else chain with a strategy map,
 * making the routing open for extension (add a strategy) and closed
 * for modification (don't edit this function).
 *
 * NOTE: This function is named `routeModelByDomain` (not `routeTurn`)
 * to avoid a name collision with `routeTurn` in routing.ts, which
 * classifies user messages into a routing domain. Both names are
 * exported from the barrel index.ts.
 *
 * Throws if the domain has no registered strategy.
 *
 * @example
 * ```ts
 * const { model, modelId, providerId } = routeModelByDomain('technical', {
 *   userSettings: { aiApiKeys: '...', chatModel: null },
 *   env: { GOOGLE_GENERATIVE_AI_API_KEY: '...' },
 * });
 * ```
 */
export function routeModelByDomain(
  domain: ModelDomain,
  ctx: DomainRoutingContext,
): ChatModelResolution {
  const strategy = MODEL_ROUTER[domain];
  if (!strategy) {
    throw new Error(
      `No model routing strategy registered for domain: "${domain}". ` +
      `Available domains: ${(Object.keys(MODEL_ROUTER) as ModelDomain[]).join(', ')}.`,
    );
  }
  return strategy.resolve(ctx);
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

/**
 * Internal helper — parse a stored "<providerId>:<bareModelId>" string
 * and verify it's resolvable with the merged BYOK payload. Returns the
 * validated provider spec + apiKey + bareModelId on success, or null
 * on any validation failure. Shared between chat / vision / embedding
 * resolvers so the parse + verify logic stays in one place.
 */
function parsePickedModelId(
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
