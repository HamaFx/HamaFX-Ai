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

// SRP: Vertex AI client creation + model resolution (extracted from model.ts).
//
// This module has a single responsibility: creating and caching Vertex AI
// LanguageModel instances from environment credentials. Consumers get a
// `resolveModel()` function that abstracts the three transport modes
// (Vertex direct, Vercel AI Gateway, direct Google Gemini API).

import { google } from '@ai-sdk/google';
import { createVertex } from '@ai-sdk/google-vertex';
import type { LanguageModel } from 'ai';
import { normalizePemPrivateKey } from './util/pem';

export interface ResolveModelEnv {
  AI_GATEWAY_API_KEY?: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY?: string | undefined;
  GOOGLE_VERTEX_PROJECT?: string | undefined;
  GOOGLE_VERTEX_LOCATION?: string | undefined;
  GOOGLE_APPLICATION_CREDENTIALS_JSON?: string | undefined;
  GOOGLE_APPLICATION_CREDENTIALS?: string | undefined;
  /**
   * Phase D2 — operator-set platform default for the embedding model
   * (RAG / memory / news embeddings). The default
   * `openai/text-embedding-3-small` works for most deployments
   * because it can route through the AI Gateway.
   */
  AI_EMBEDDING_MODEL?: string | undefined;
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
    private_key: normalizePemPrivateKey(privateKey),
  };
  if (typeof parsed.private_key_id === 'string') {
    creds.private_key_id = parsed.private_key_id;
  }
  return creds;
}

// Phase 3 §3.10 — per-tenant Vertex client cache.
const _vertexCache = new Map<string, ReturnType<typeof createVertex>>();

function getVertex(env: ResolveModelEnv, tenantId?: string): ReturnType<typeof createVertex> {
  if (!env.GOOGLE_VERTEX_PROJECT || !env.GOOGLE_VERTEX_LOCATION) {
    throw new Error(
      'GOOGLE_VERTEX_PROJECT and GOOGLE_VERTEX_LOCATION are required for `google-vertex/...` models',
    );
  }

  // Cache key includes everything that affects auth so dev hot-reloads pick up changes.
  const cacheKey = `${tenantId ?? '__global__'}|${env.GOOGLE_VERTEX_PROJECT}|${env.GOOGLE_VERTEX_LOCATION}|${env.GOOGLE_APPLICATION_CREDENTIALS_JSON ?? ''}|${env.GOOGLE_APPLICATION_CREDENTIALS ?? ''}`;
  const cached = _vertexCache.get(cacheKey);
  if (cached) return cached;

  const config: Parameters<typeof createVertex>[0] = {
    project: env.GOOGLE_VERTEX_PROJECT,
    location: env.GOOGLE_VERTEX_LOCATION,
  };

  if (env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    const creds = parseVertexCredentials(env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    config.googleAuthOptions = { credentials: creds };
  }

  const vertex = createVertex(config);
  _vertexCache.set(cacheKey, vertex);
  return vertex;
}

/**
 * Resolve a model id to either:
 *   - a `LanguageModel` instance (Vertex or direct Gemini), or
 *   - the same string (gateway mode).
 *
 * Throws if no transport is configured for the requested id.
 */
export function resolveModel(modelId: string, env: ResolveModelEnv, tenantId?: string): LanguageModel | string {
  if (modelId.startsWith('google-vertex/')) {
    const bareId = modelId.slice('google-vertex/'.length);
    return getVertex(env, tenantId)(bareId);
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
export function getVertexGoogleSearchTool(env: ResolveModelEnv, tenantId?: string) {
  return getVertex(env, tenantId).tools.googleSearch({});
}
