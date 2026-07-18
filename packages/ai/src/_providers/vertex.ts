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

import { createVertex } from '@ai-sdk/google-vertex';
import { CAPS_FULL, defineProvider } from './helpers';
import { normalizePemPrivateKey } from '../util/pem';

export const VERTEX = defineProvider({
  id: 'vertex',
  displayName: 'Google Vertex AI',
  familyName: 'Gemini (Vertex)',
  keyHint: '{…service account JSON…}',
  description: 'Vertex AI Gemini via GCP service account. Bills against your GCP project quota.',
  pricingTier: 'medium',
  docsUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference',
  defaultModels: {
    fundamental: 'gemini-2.5-pro',
    technical: 'gemini-2.5-flash',
    summary: 'gemini-2.5-flash-lite',
    vision: 'gemini-2.5-pro',
    embedding: 'text-embedding-005',
  },
  bestFor: 'GCP quota / enterprise',
  supports: { vision: true, embedding: true },
  models: [
    { modelId: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Vertex)', description: 'Newest Flash on Vertex with GCP billing.', tier: 'flagship', inputPerMTokUsd: 0.30, outputPerMTokUsd: 2.50, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-06' },
    { modelId: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Vertex)', description: 'Best reasoning, deep analysis. 1M context. GCP quota.', tier: 'flagship', inputPerMTokUsd: 1.25, outputPerMTokUsd: 10, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2025-04' },
    { modelId: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Vertex)', description: 'Balanced price/perf, vision. GCP billing.', tier: 'pro', inputPerMTokUsd: 0.30, outputPerMTokUsd: 2.50, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2025-04' },
    { modelId: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Vertex)', description: 'Cheapest Gemini on Vertex.', tier: 'lite', inputPerMTokUsd: 0.10, outputPerMTokUsd: 0.40, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2025-07' },
    { modelId: 'text-embedding-005', label: 'Embedding 005 (Vertex)', description: 'Vertex text embedding (768d).', tier: 'embedding', inputPerMTokUsd: 0.025, outputPerMTokUsd: null, contextTokens: 2_048, capabilities: {}, released: '2025-04' },
  ],
  factory: (apiKey) => {
    const projectFromKey = apiKey.match(/"project_id"\s*:\s*"([^"]+)"/)?.[1] || '';
    const project = process.env.GOOGLE_VERTEX_PROJECT || projectFromKey || '';
    const location = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
    return (modelId) => {
      let parsed: { client_email: string; private_key: string };
      try {
        const obj = JSON.parse(apiKey) as Record<string, unknown>;
        if (typeof obj.client_email !== 'string' || typeof obj.private_key !== 'string') {
          throw new Error('Vertex key is not valid service-account JSON (missing client_email or private_key)');
        }
        parsed = { client_email: obj.client_email, private_key: normalizePemPrivateKey(obj.private_key) };
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'Vertex service-account JSON could not be parsed');
      }
      if (!project) {
        throw new Error('Vertex project not found. Set GOOGLE_VERTEX_PROJECT env or include project_id in the service-account JSON.');
      }
      const vertex = createVertex({ project, location, googleAuthOptions: { credentials: parsed } });
      return vertex(modelId);
    };
  },
});
