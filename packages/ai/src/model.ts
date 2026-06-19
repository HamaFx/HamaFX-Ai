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

import { decryptByok } from '@hamafx/shared/encryption';
import type { UserSettingsRow } from '@hamafx/db/schema';

import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Resolves a BYOK model based on the user's available encrypted API keys.
 * Will prefer the explicitly requested provider/model if available, falling back
 * to whatever the user has keys for.
 */
export function resolveUserModel(
  userSettings: Pick<UserSettingsRow, 'aiApiKeys'>,
  domain: 'default' | 'vision' | 'summary' | 'embedding' | 'fundamental' | 'technical',
  env: ResolveModelEnv
): { model: LanguageModel; modelId: string } {
  const keys = decryptByok(userSettings.aiApiKeys);
  
  if (!keys || Object.keys(keys).length === 0) {
    throw new Error('No AI API keys configured. Please add your keys in Settings.');
  }

  // TODO: we could read preferences if the user wants to force a specific provider,
  // but for now we just try them in a preference order if they have multiple.
  
  // Create provider instances dynamically using their keys
  // For Gemini:
  if (keys.google) {
    const googleProvider = createGoogleGenerativeAI({ apiKey: keys.google });
    // In a real app we'd map domains to specific models, here we just use defaults
    const modelMap: Record<string, string> = {
      default: 'gemini-2.5-flash',
      vision: 'gemini-2.5-pro',
      summary: 'gemini-2.5-flash',
      embedding: 'text-embedding-004',
      fundamental: 'gemini-2.5-pro',
      technical: 'gemini-2.5-flash',
    };
    const modelId = modelMap[domain] || 'gemini-2.5-flash';
    return { model: googleProvider(modelId), modelId: `google/${modelId}` };
  }

  // If we had OpenAI/Anthropic providers imported, we'd do the same here.
  // For now, if they don't have google but have something else, we can't route yet
  // since only google is imported in this file.
  throw new Error('Only Google (Gemini) keys are currently fully wired in resolveUserModel.');
}
