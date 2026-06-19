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

/**
 * Domain values accepted by resolveUserModel. Includes 'default' for the
 * generic case (mapped to `technical` internally) and 'embedding' for the
 * separate embeddings path.
 */
export type ResolveUserDomain =
  | 'default'
  | 'vision'
  | 'summary'
  | 'embedding'
  | 'fundamental'
  | 'technical';

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
 * Pick the best provider for a domain from the user's configured providers.
 * Falls back across providers if the preferred one has no model for that domain.
 * Returns null when nothing usable is configured.
 */
function pickProviderForDomain(
  keys: ByokPayload,
  domain: ModelDomain,
  preferredOrder: ProviderId[],
): ProviderId | null {
  for (const id of preferredOrder) {
    const apiKey = keys[id];
    if (!apiKey) continue;
    const models = BYOK_PROVIDERS[id]?.defaultModels;
    if (!models) continue;
    if (domain === 'embedding' && models.embedding) return id;
    if (domain === 'vision' && models.vision) return id;
    if (
      domain === 'fundamental' ||
      domain === 'technical' ||
      domain === 'summary'
    ) {
      return id;
    }
  }
  return null;
}

/**
 * Resolves a BYOK model based on the user's available encrypted API keys.
 * Will prefer the explicitly requested provider/model if available, falling back
 * to whatever the user has keys for.
 *
 * Note: `env` is reserved for a future "global fallback when the user has no
 * BYOK keys" path. Today we require BYOK to be configured and ignore env —
 * until that fallback ships the parameter is explicitly unused.
 */
export function resolveUserModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys'>,
  domain: ResolveUserDomain,
  env: ResolveModelEnv
): { model: LanguageModel; modelId: string } {
  const stored = decryptByok(userSettings.aiApiKeys);

  // Merge BYOK keys with operator-provided env vars. When the user has
  // not yet configured a BYOK key for a provider but the operator did
  // (e.g. GOOGLE_GENERATIVE_AI_API_KEY in .env.production), we fall back
  // to the env value so single-tenant deployments keep working without
  // forcing every user through onboarding. A user-saved BYOK key
  // always wins over the env value for the same provider.
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

  // Order configured providers by PROVIDER_PRIORITY so the user's strongest
  // provider wins by default.
  const priority = configured.slice().sort(
    (a, b) => PROVIDER_PRIORITY.indexOf(a) - PROVIDER_PRIORITY.indexOf(b),
  );

  // Map our public 'default' to the technical domain (the most common case).
  const effectiveDomain: ModelDomain =
    domain === 'default' ? 'technical' : (domain as ModelDomain);

  const providerId = pickProviderForDomain(keys, effectiveDomain, priority);
  if (!providerId) {
    throw new Error(
      `No configured provider supports the "${domain}" domain. ` +
        `Add a key for a provider that supports this domain (see Settings → API Keys).`,
    );
  }

  const spec = BYOK_PROVIDERS[providerId];
  const apiKey = keys[providerId]!;

  // Resolve the model id for the chosen provider + domain, falling back to
  // 'technical' when vision is null and to 'technical' when embedding is null.
  let modelId: string | null = null;
  if (effectiveDomain === 'embedding') {
    modelId = spec.defaultModels.embedding ?? spec.defaultModels.technical;
  } else if (effectiveDomain === 'vision') {
    modelId = spec.defaultModels.vision ?? spec.defaultModels.technical;
  } else {
    modelId = spec.defaultModels[effectiveDomain];
  }

  if (!modelId) {
    throw new Error(
      `Provider ${providerId} has no model configured for ${effectiveDomain}.`,
    );
  }

  const model = spec.factory(apiKey)(modelId);

  // Returned modelId keeps the original provider prefix when applicable so
  // cost estimation + telemetry can identify the upstream.
  return { model, modelId: `${spec.id}/${modelId}` };
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
  if (!apiKey || apiKey.length < 8) {
    return { ok: false, error: 'API key is too short' };
  }

  // Use the cheapest model to test connection — we just want a round-trip.
  // We deliberately don't call the model here — that would require a full
  // AI SDK stream roundtrip. Instead we instantiate the provider SDK
  // which validates auth shape (base URL, headers). The real test happens
  // on the first chat turn.
  try {
    spec.factory(apiKey);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Re-export the registry helpers for downstream callers.
export { BYOK_PROVIDERS, BYOK_PROVIDERS_LIST, defaultModelFor };
export type { ModelDomain, ByokProviderSpec };
