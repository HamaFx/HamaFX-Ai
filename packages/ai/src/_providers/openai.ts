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

import { CAPS_FULL, defineProvider, openaiCompatibleFactory } from './helpers';

export const OPENAI = defineProvider({
  id: 'openai',
  displayName: 'OpenAI (ChatGPT)',
  familyName: 'GPT',
  keyHint: 'sk-…',
  description: 'GPT-5.6 family + GPT-4o — strong tools, vision, embeddings.',
  pricingTier: 'medium',
  docsUrl: 'https://developers.openai.com/api/docs/models',
  baseURL: 'https://api.openai.com/v1',
  defaultModels: {
    fundamental: 'gpt-5.6-sol',
    technical: 'gpt-5.6-terra',
    summary: 'gpt-5.6-luna',
    vision: 'gpt-5.6-terra',
    embedding: 'text-embedding-3-small',
  },
  bestFor: 'General purpose + tools',
  supports: { vision: true, embedding: true },
  models: [
    { modelId: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', description: 'Frontier model for complex reasoning and coding.', tier: 'flagship', inputPerMTokUsd: 5, outputPerMTokUsd: 30, contextTokens: 1_050_000, capabilities: CAPS_FULL, released: '2026-02' },
    { modelId: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', description: 'Balanced intelligence and cost — default workhorse.', tier: 'pro', inputPerMTokUsd: 2.5, outputPerMTokUsd: 15, contextTokens: 1_050_000, capabilities: CAPS_FULL, released: '2026-02' },
    { modelId: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', description: 'Cost-sensitive high-volume workloads.', tier: 'lite', inputPerMTokUsd: 1, outputPerMTokUsd: 6, contextTokens: 1_050_000, capabilities: CAPS_FULL, released: '2026-02' },
    { modelId: 'gpt-5.6', label: 'GPT-5.6 (alias)', description: 'Alias for the current GPT-5.6 flagship line.', tier: 'flagship', inputPerMTokUsd: 5, outputPerMTokUsd: 30, contextTokens: 1_050_000, capabilities: CAPS_FULL, released: '2026-02' },
    { modelId: 'gpt-4o', label: 'GPT-4o', description: 'Previous multimodal flagship.', tier: 'pro', inputPerMTokUsd: 2.5, outputPerMTokUsd: 10, contextTokens: 128_000, capabilities: CAPS_FULL, released: '2024-08' },
    { modelId: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'Cheap, fast, multimodal.', tier: 'lite', inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6, contextTokens: 128_000, capabilities: CAPS_FULL, released: '2024-07' },
    { modelId: 'gpt-4.1', label: 'GPT-4.1', description: 'Long-context GPT-4.1 (still useful for 1M context).', tier: 'pro', inputPerMTokUsd: 2, outputPerMTokUsd: 8, contextTokens: 1_047_576, capabilities: CAPS_FULL, released: '2025-04' },
    { modelId: 'text-embedding-3-small', label: 'Embedding 3 small', description: '1536-dim text embeddings.', tier: 'embedding', inputPerMTokUsd: 0.02, outputPerMTokUsd: null, contextTokens: 8_191, capabilities: {}, released: '2024-01' },
    { modelId: 'text-embedding-3-large', label: 'Embedding 3 large', description: '3072-dim text embeddings, best quality.', tier: 'embedding', inputPerMTokUsd: 0.13, outputPerMTokUsd: null, contextTokens: 8_191, capabilities: {}, released: '2024-01' },
  ],
  factory: openaiCompatibleFactory('openai', 'https://api.openai.com/v1'),
});
