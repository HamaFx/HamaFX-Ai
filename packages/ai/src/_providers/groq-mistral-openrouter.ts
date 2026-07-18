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

import { CAPS_FULL, CAPS_TEXT, defineProvider, openaiCompatibleFactory } from './helpers';

export const GROQ = defineProvider({
  id: 'groq',
  displayName: 'Groq',
  familyName: 'Llama / GPT-OSS',
  keyHint: 'gsk_…',
  description: 'Groq inference — extremely fast open-weight models, free tier.',
  pricingTier: 'free',
  docsUrl: 'https://console.groq.com/docs/models',
  baseURL: 'https://api.groq.com/openai/v1',
  defaultModels: {
    fundamental: 'openai/gpt-oss-120b',
    technical: 'llama-3.3-70b-versatile',
    summary: 'llama-3.1-8b-instant',
    vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
    embedding: null,
  },
  bestFor: 'Ultra-low latency',
  supports: { vision: true, embedding: false },
  models: [
    { modelId: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', description: 'OpenAI open-weight 120B on Groq LPUs (~500 t/s).', tier: 'flagship', inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6, contextTokens: 131_072, capabilities: CAPS_TEXT, released: '2025-08' },
    { modelId: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', description: 'Fast open-weight 20B (~1000 t/s).', tier: 'fast', inputPerMTokUsd: 0.075, outputPerMTokUsd: 0.3, contextTokens: 131_072, capabilities: CAPS_TEXT, released: '2025-08' },
    { modelId: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', description: 'Strong open 70B, very fast on Groq.', tier: 'pro', inputPerMTokUsd: 0.59, outputPerMTokUsd: 0.79, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2024-12' },
    { modelId: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', description: 'Tiny, sub-second latency for titles/summaries.', tier: 'lite', inputPerMTokUsd: 0.05, outputPerMTokUsd: 0.08, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2024-07' },
    { modelId: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', description: 'Llama 4 multimodal Scout — vision + tools.', tier: 'pro', inputPerMTokUsd: 0.11, outputPerMTokUsd: 0.34, contextTokens: 128_000, capabilities: CAPS_FULL, released: '2025-04' },
    { modelId: 'qwen/qwen3.6-27b', label: 'Qwen3.6 27B', description: 'Strong open Qwen on Groq.', tier: 'pro', inputPerMTokUsd: 0.2, outputPerMTokUsd: 0.6, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2026-03' },
  ],
  factory: openaiCompatibleFactory('groq', 'https://api.groq.com/openai/v1'),
});

export const MISTRAL = defineProvider({
  id: 'mistral',
  displayName: 'Mistral AI',
  familyName: 'Mistral',
  keyHint: '…',
  description: 'Mistral Medium / Small / Pixtral — European host, strong tools + vision.',
  pricingTier: 'low',
  docsUrl: 'https://docs.mistral.ai/models/overview',
  baseURL: 'https://api.mistral.ai/v1',
  defaultModels: {
    fundamental: 'mistral-medium-latest',
    technical: 'mistral-small-latest',
    summary: 'ministral-8b-latest',
    vision: 'pixtral-large-latest',
    embedding: 'mistral-embed',
  },
  bestFor: 'EU host + coding',
  supports: { vision: true, embedding: true },
  models: [
    { modelId: 'mistral-medium-latest', label: 'Mistral Medium (latest)', description: 'Frontier multimodal / agentic Medium line.', tier: 'flagship', inputPerMTokUsd: 0.4, outputPerMTokUsd: 2, contextTokens: 128_000, capabilities: CAPS_FULL, released: '2026-04' },
    { modelId: 'mistral-large-latest', label: 'Mistral Large (latest)', description: 'Large reasoning model, long context.', tier: 'flagship', inputPerMTokUsd: 2, outputPerMTokUsd: 6, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2025-12' },
    { modelId: 'mistral-small-latest', label: 'Mistral Small (latest)', description: 'Cheap, fast hybrid instruct/reasoning/coding.', tier: 'fast', inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.3, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2026-03' },
    { modelId: 'pixtral-large-latest', label: 'Pixtral Large (vision)', description: 'Vision-capable Mistral.', tier: 'pro', inputPerMTokUsd: 2, outputPerMTokUsd: 6, contextTokens: 128_000, capabilities: CAPS_FULL, released: '2024-11' },
    { modelId: 'codestral-latest', label: 'Codestral', description: 'Code-specialised Mistral model.', tier: 'pro', inputPerMTokUsd: 0.3, outputPerMTokUsd: 0.9, contextTokens: 256_000, capabilities: CAPS_TEXT, released: '2025-08' },
    { modelId: 'ministral-8b-latest', label: 'Ministral 8B', description: 'Tiny edge model for summaries.', tier: 'lite', inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.1, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2025-12' },
    { modelId: 'mistral-embed', label: 'Mistral Embed', description: '1024-dim text embeddings.', tier: 'embedding', inputPerMTokUsd: 0.1, outputPerMTokUsd: null, contextTokens: 8_192, capabilities: {}, released: '2023-12' },
  ],
  factory: openaiCompatibleFactory('mistral', 'https://api.mistral.ai/v1'),
});

export const OPENROUTER = defineProvider({
  id: 'openrouter',
  displayName: 'OpenRouter',
  familyName: 'Any model',
  keyHint: 'sk-or-…',
  description: 'OpenRouter — one key for 100+ models from every provider.',
  pricingTier: 'medium',
  docsUrl: 'https://openrouter.ai/docs',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultModels: {
    fundamental: 'anthropic/claude-opus-4-8',
    technical: 'openai/gpt-5.6-terra',
    summary: 'google/gemini-2.5-flash-lite',
    vision: 'anthropic/claude-sonnet-5',
    embedding: 'openai/text-embedding-3-small',
  },
  bestFor: '100+ models, 1 key',
  supports: { vision: true, embedding: true },
  models: [
    { modelId: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8 (via OpenRouter)', description: 'Top Anthropic reasoning via OpenRouter.', tier: 'flagship', inputPerMTokUsd: 5, outputPerMTokUsd: 25, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-05' },
    { modelId: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5 (via OpenRouter)', description: 'Balanced Claude via OpenRouter.', tier: 'pro', inputPerMTokUsd: 3, outputPerMTokUsd: 15, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-05' },
    { modelId: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra (via OpenRouter)', description: 'OpenAI balanced flagship.', tier: 'flagship', inputPerMTokUsd: 2.5, outputPerMTokUsd: 15, contextTokens: 1_050_000, capabilities: CAPS_FULL, released: '2026-02' },
    { modelId: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (via OpenRouter)', description: 'Google reasoning, 1M context.', tier: 'flagship', inputPerMTokUsd: 1.25, outputPerMTokUsd: 10, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2025-04' },
    { modelId: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (via OpenRouter)', description: 'Cheap Google model for summaries.', tier: 'lite', inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.4, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2025-07' },
    { modelId: 'openai/gpt-4o-mini', label: 'GPT-4o mini (via OpenRouter)', description: 'Cheap, fast, multimodal.', tier: 'lite', inputPerMTokUsd: 0.15, outputPerMTokUsd: 0.6, contextTokens: 128_000, capabilities: CAPS_FULL, released: '2024-07' },
    { modelId: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (via OpenRouter)', description: 'Open-source 70B.', tier: 'fast', inputPerMTokUsd: 0.1, outputPerMTokUsd: 0.1, contextTokens: 128_000, capabilities: CAPS_TEXT, released: '2024-12' },
    { modelId: 'openai/text-embedding-3-small', label: 'Embedding 3 small (via OpenRouter)', description: '1536-dim text embeddings.', tier: 'embedding', inputPerMTokUsd: 0.02, outputPerMTokUsd: null, contextTokens: 8_191, capabilities: {}, released: '2024-01' },
  ],
  factory: openaiCompatibleFactory('openrouter', 'https://openrouter.ai/api/v1', {
    'HTTP-Referer': 'https://hamafx.ai',
    'X-Title': 'HamaFX AI',
  }),
});
