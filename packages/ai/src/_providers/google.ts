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

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CAPS_FULL, defineProvider } from './helpers';

export const GOOGLE = defineProvider({
  id: 'google',
  displayName: 'Google AI (Gemini)',
  familyName: 'Gemini',
  keyHint: 'AIza…',
  description: 'Google Gemini models — generous free tier, fast, vision-capable.',
  pricingTier: 'free',
  docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  defaultModels: {
    fundamental: 'gemini-2.5-pro',
    technical: 'gemini-2.5-flash',
    summary: 'gemini-2.5-flash-lite',
    vision: 'gemini-2.5-pro',
    embedding: 'gemini-embedding-001',
  },
  bestFor: 'Free tier + long context',
  supports: { vision: true, embedding: true },
  models: [
    {
      modelId: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash',
      description: 'Newest stable Flash — strong agentic + multimodal.',
      tier: 'flagship',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-06',
    },
    {
      modelId: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash-Lite',
      description: 'Newest cheap/fast Gemini for high-volume turns.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2026-05',
    },
    {
      modelId: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      description: 'Best 2.5 reasoning, deep analysis. 1M context.',
      tier: 'flagship',
      inputPerMTokUsd: 1.25,
      outputPerMTokUsd: 10,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      description: 'Balanced price/perf, 1M context, vision.',
      tier: 'pro',
      inputPerMTokUsd: 0.30,
      outputPerMTokUsd: 2.50,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2025-04',
    },
    {
      modelId: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      description: 'Cheapest stable Gemini for summaries/planner.',
      tier: 'lite',
      inputPerMTokUsd: 0.10,
      outputPerMTokUsd: 0.40,
      contextTokens: 1_000_000,
      capabilities: CAPS_FULL,
      released: '2025-07',
    },
    {
      modelId: 'gemini-embedding-2',
      label: 'Gemini Embedding 2',
      description: 'Multimodal embeddings (text/image/video/audio/PDF).',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 8_192,
      capabilities: {},
      released: '2026-04',
    },
    {
      modelId: 'gemini-embedding-001',
      label: 'Gemini Embedding 001',
      description: 'Stable text embeddings for RAG.',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 2_048,
      capabilities: {},
      released: '2025-01',
    },
    {
      modelId: 'text-embedding-004',
      label: 'Embedding 004 (legacy)',
      description: 'Legacy Gemini embedding id — prefer gemini-embedding-001.',
      tier: 'embedding',
      inputPerMTokUsd: 0.025,
      outputPerMTokUsd: null,
      contextTokens: 2_048,
      capabilities: {},
      released: '2024-04',
    },
  ],
  factory: (apiKey) => {
    const provider = createGoogleGenerativeAI({ apiKey });
    return (modelId) => provider(modelId);
  },
});
