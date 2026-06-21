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
// route the call. We support three transports (see packages/shared/src/env.ts):
//
//   1. Google Vertex AI (direct), id prefix `google-vertex/`:
//      Uses `@ai-sdk/google-vertex`. Always direct — bypasses the gateway —
//      so usage bills against the GCP project's Vertex AI quota/credits.
//      Requires GOOGLE_VERTEX_PROJECT + GOOGLE_VERTEX_LOCATION, and either
//      GOOGLE_APPLICATION_CREDENTIALS_JSON (single-line SA key JSON) or
//      GOOGLE_APPLICATION_CREDENTIALS (path).
//
//   2. Vercel AI Gateway, any other prefixed id (e.g. `openai/gpt-4.1`,
//      `google/gemini-2.5-flash`) when AI_GATEWAY_API_KEY is set:
//      The SDK accepts the string directly. Billed by Vercel.
//
//   3. Direct Google Gemini API, id prefix `google/` when
//      GOOGLE_GENERATIVE_AI_API_KEY is set and the gateway is not:
//      Strip the prefix and use `@ai-sdk/google`.
//
// `google-vertex/` always wins over the gateway, so adding the gateway key
// does NOT silently flip Vertex traffic onto Vercel's bill.

import { google } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';

export interface ResolveModelEnv {
  AI_GATEWAY_API_KEY?: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
  GOOGLE_VERTEX_PROJECT?: string | undefined;
  GOOGLE_VERTEX_LOCATION?: string | undefined;
  GOOGLE_APPLICATION_CREDENTIALS_JSON?: string | undefined;
  GOOGLE_APPLICATION_CREDENTIALS?: string | undefined;
}

interface VertexCredentials {
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

function parseVertexCredentials(json: string): VertexCredentials {
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS_JSON is missing client_email or private_key',
    );
  }
  const creds: VertexCredentials = {
    client_email: clientEmail,
    private_key: privateKey,
  };
  if (typeof parsed.private_key_id === 'string') {
    creds.private_key_id = parsed.private_key_id;
  }
  return creds;
}

let cachedVertex: ReturnType<typeof createVertex> | null = null;
let cachedVertexKey: string | null = null;

function getVertex(env: ResolveModelEnv): ReturnType<typeof createVertex> {
  if (!env.GOOGLE_VERTEX_PROJECT || !env.GOOGLE_VERTEX_LOCATION) {
    throw new Error(
      'GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_LOCATION are required for `google-vertex/...` models',
    );
  }

  // Cache key includes everything that affects auth so dev hot-reloads pick up changes.
  const cacheKey = `${env.GOOGLE_VERTEX_PROJECT}|${env.GOOGLE_VERTEX_LOCATION}|${env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? ''}|${env.GOOGLE_APPLICATION_CREDENTIALS ?? ''}`;
  if (cachedVertex && cachedVertexKey === cacheKey) return cachedVertex;

  const config: Parameters<typeof createVertex>[0] = {
    project: env.GOOGLE_VERTEX_PROJECT,
    location: env.GOOGLE_VERTEX_LOCATION,
  };

  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const creds = parseVertexCredentials(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    config.googleAuthOptions = { credentials: creds };
  }
  // If only GOOGLE_APPLICATION_CREDENTIALS (a path) is set, google-auth-library
  // reads it automatically from process.env — no extra wiring needed.

  cachedVertex = createVertex(config);
  cachedVertexKey = cacheKey;
  return cachedVertex;
}

/**
 * Resolve a model id to either:
 *   - a `LanguageModel` instance (Vertex or direct Gemini), or
 *   - the same string (gateway mode).
 *
 * Throws if no transport is configured for the requested id.
 */
export function resolveModel(modelId: string, env: ResolveModelEnv): LanguageModel | string {
  if (modelId.startsWith('google-vertex/')) {
    const bareId = modelId.slice('google-vertex/'.length);
    return getVertex(env)(bareId);
  }

  if (env.AI_GATEWAY_API_KEY) {
    return modelId;
  }

  if (modelId.startsWith('google/')) {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY is required to use a `google/...` model when AI_GATEWAY_API_KEY is not set',
      );
    }
    const bareId = modelId.slice('google/'.length);
    return google(bareId);
  }

  throw new Error(
    `Cannot resolve model "${modelId}". Use a "google-vertex/..." id with GOOGLE_VERTEX_PROJECT+GOOGLE_VERTEX_LOCATION, set AI_GATEWAY_API_KEY for gateway routing, or use a "google/..." id with GOOGLE_GENERATIVE_AI_API_KEY.`,
  );
}

/**
 * Returns the Google Search grounding tool via the Vertex AI provider.
 * This tool must be used with a `google-vertex/` model.
 */
export function getVertexGoogleSearchTool(env: ResolveModelEnv) {
  return getVertex(env).tools.googleSearch({});
}

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
import { generateText } from 'ai';
import { PROVIDER_IDS } from '@hamafx/shared/byok';

/**
 * Provider priority when multiple keys are configured — higher index wins for default. */
const PROVIDER_PRIORITY: ProviderId[] = [
  // Premium: prefer the strongest reasoning model when configured.
  'google',
  'anthropic',
  'openai',
  // Aggregators / alt providers.
  'openrouter',
  'xai',
  'mistral',
  'groq',
  'deepseek',
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
  return out;
}

/**
 * Test the validity of a provider API key by instantiating a tiny request.
 * Returns null on success, an error message on failure.
 *
 * Used by the /api/settings/test-provider route to give the user feedback
 * without doing a full chat turn.
 */
export async function testProviderKey(
  providerId: ProviderId,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) return { ok: false, error: `Unknown provider: ${providerId}` };

  // Length floor depends on the key shape. Most providers use opaque
  // strings >= 16 chars. Vertex is a service-account JSON document
  // (>= 512 chars typically). We pick the right floor per provider.
  const minLen = providerId === 'vertex' ? 256 : 8;
  if (!apiKey || apiKey.length < minLen) {
    if (providerId === 'vertex') {
      return {
        ok: false,
        error: 'Vertex service-account JSON looks too short. Did you paste the whole file?',
      };
    }
    return { ok: false, error: 'API key is too short' };
  }

  // Provider-specific shape validation BEFORE we call factory() —
  // factory() throws on bad JSON for vertex but we want a friendlier
  // error message that names the field that's missing.
  if (providerId === 'vertex') {
    try {
      const obj = JSON.parse(apiKey) as Record<string, unknown>;
      if (typeof obj.client_email !== 'string') {
        return { ok: false, error: 'Service account JSON is missing client_email' };
      }
      if (typeof obj.private_key !== 'string') {
        return { ok: false, error: 'Service account JSON is missing private_key' };
      }
      if (!obj.client_email.includes('@')) {
        return { ok: false, error: 'Service account JSON client_email is not an email' };
      }
      if (!obj.private_key.includes('BEGIN PRIVATE KEY')) {
        return { ok: false, error: 'Service account private_key is not a PEM key' };
      }
      if (!process.env.GOOGLE_VERTEX_PROJECT && typeof obj.project_id !== 'string') {
        return {
          ok: false,
          error:
            'Set GOOGLE_VERTEX_PROJECT env or include project_id in the service-account JSON',
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Service account JSON could not be parsed: ${err instanceof Error ? err.message : 'unknown error'}`,
      };
    }
  }

  // Phase D — bug fix: the previous version of this function only
  // instantiated `spec.factory(apiKey)`, which for the OpenAI-compatible
  // shim (Mistral/OpenRouter/xAI/DeepSeek/Groq) and the Anthropic SDK is a
  // pure local construction — it stores the key in a closure and returns a
  // builder without ever contacting the provider. That meant the test
  // returned `ok: true` for any well-formed string, even complete junk.
  // Users saw "key works" and the actual chat then failed with a 401.
  //
  // The fix: actually call the provider with the cheapest model we know.
  // We budget `maxOutputTokens: 1` so the round-trip costs pennies, and we
  // use `fundamental` because every BYOK spec defines one (chat-capable).
  // Vertex is special-cased — the SA JSON is parsed locally for shape
  // before we even reach here (above), and we still call the model to
  // prove the credentials are accepted by the GCP IAM endpoint.
  try {
    const builder = spec.factory(apiKey);
    const modelId = spec.defaultModels.fundamental;
    const model = builder(modelId);
    await generateText({
      model,
      prompt: 'ping',
      maxOutputTokens: 1,
      // Abort quickly on auth failures — most providers respond in <1s
      // with 401/403; if we time out, the test was 5s of waiting.
      abortSignal: AbortSignal.timeout(5_000),
    });
    return { ok: true };
  } catch (err) {
    // AI SDK wraps provider errors with statusCode + responseBody. Pull
    // the most useful line out for the UI to display. Example shapes:
    //   APICallError: "Provider API error: 401 Unauthorized" (OpenAI)
    //   APICallError: "Provider returned error 401 from ... "
    //   InvalidResponseDataError: ...
    //   plain Error: "fetch failed" (network down)
    const message =
      err instanceof Error
        ? // APICallError exposes .statusCode and .responseBody
          (err as { statusCode?: number; responseBody?: string }).statusCode !==
          undefined
          ? `HTTP ${(err as { statusCode?: number }).statusCode} — ${extractErrorMessage(err.message)}`
          : extractErrorMessage(err.message)
        : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Strip a verbose AI SDK error down to the user-facing sentence.
 * The SDK often appends stack-trace-style noise (URLs, provider
 * name in brackets). For the api-keys card we want a single line.
 */
function extractErrorMessage(raw: string): string {
  // Take only the first line; most error messages from the SDK are
  // newline-free but `APICallError` sometimes embeds a JSON blob.
  const firstLine = raw.split('\n')[0]?.trim() ?? raw;
  // Trim trailing dots for consistency (UI will append its own).
  return firstLine.replace(/\.+$/, '').slice(0, 160);
}

// Re-export the registry helpers for downstream callers.
export { BYOK_PROVIDERS, BYOK_PROVIDERS_LIST, defaultModelFor };
export type { ModelDomain, ByokProviderSpec };

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
): ChatModelResolution {
  const stored = decryptByok(userSettings.aiApiKeys);
  const keys: ByokPayload = {
    ...envFallbackKeys(env),
    ...(stored ?? {}),
  };
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
    // Invalid stored value — fall through to spec defaults below
    // rather than throwing. Logging would be useful here in future.
  }

  // No explicit pick: use the priority-ordered first configured
  // provider's `technical` model. This is the path single-tenant
  // installs and brand-new users hit.
  const priority = configured.slice().sort(
    (a, b) => PROVIDER_PRIORITY.indexOf(a) - PROVIDER_PRIORITY.indexOf(b),
  );
  const providerId = priority[0];
  if (!providerId) {
    throw new Error('No configured provider available.');
  }
  const spec = BYOK_PROVIDERS[providerId];
  const apiKey = keys[providerId]!;
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
