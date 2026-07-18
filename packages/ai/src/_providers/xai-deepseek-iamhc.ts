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

export const XAI = defineProvider({
  id: 'xai',
  displayName: 'xAI (Grok)',
  familyName: 'Grok',
  keyHint: 'xai-…',
  description: 'Grok 4.5 / 4.3 — strong reasoning, tools, vision, large context.',
  pricingTier: 'medium',
  docsUrl: 'https://docs.x.ai/developers/models',
  baseURL: 'https://api.x.ai/v1',
  defaultModels: {
    fundamental: 'grok-4.5',
    technical: 'grok-4.3',
    summary: 'grok-4.3',
    vision: 'grok-4.5',
    embedding: null,
  },
  bestFor: 'Agentic tools + search',
  supports: { vision: true, embedding: false },
  models: [
    { modelId: 'grok-4.5', label: 'Grok 4.5', description: 'Flagship Grok for code + agents. 500k context.', tier: 'flagship', inputPerMTokUsd: 2, outputPerMTokUsd: 6, contextTokens: 500_000, capabilities: CAPS_FULL, released: '2026-06' },
    { modelId: 'grok-4.3', label: 'Grok 4.3', description: 'Balanced Grok chat model. 1M context.', tier: 'pro', inputPerMTokUsd: 1.25, outputPerMTokUsd: 2.5, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-05' },
    { modelId: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 Reasoning', description: 'Reasoning-tuned Grok 4.20 snapshot.', tier: 'pro', inputPerMTokUsd: 1.25, outputPerMTokUsd: 2.5, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-03' },
    { modelId: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 Fast', description: 'Non-reasoning / lower-latency Grok 4.20.', tier: 'fast', inputPerMTokUsd: 1.25, outputPerMTokUsd: 2.5, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-03' },
  ],
  factory: openaiCompatibleFactory('xai', 'https://api.x.ai/v1'),
});

export const DEEPSEEK = defineProvider({
  id: 'deepseek',
  displayName: 'DeepSeek',
  familyName: 'DeepSeek',
  keyHint: 'sk-…',
  description: 'DeepSeek V4 — strong reasoning at very low cost (1M context).',
  pricingTier: 'low',
  docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  baseURL: 'https://api.deepseek.com',
  defaultModels: {
    fundamental: 'deepseek-v4-pro',
    technical: 'deepseek-v4-flash',
    summary: 'deepseek-v4-flash',
    vision: null,
    embedding: null,
  },
  bestFor: 'Cheap reasoning',
  supports: { vision: false, embedding: false },
  models: [
    { modelId: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'Best DeepSeek reasoning / agentic coding. 1M context.', tier: 'flagship', inputPerMTokUsd: 0.435, outputPerMTokUsd: 0.87, contextTokens: 1_000_000, capabilities: CAPS_TEXT, released: '2026-03' },
    { modelId: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', description: 'Fast/cheap V4 with optional thinking mode. 1M context.', tier: 'pro', inputPerMTokUsd: 0.14, outputPerMTokUsd: 0.28, contextTokens: 1_000_000, capabilities: CAPS_TEXT, released: '2026-03' },
    { modelId: 'deepseek-chat', label: 'DeepSeek Chat (alias → V4 Flash non-thinking)', description: 'Legacy alias. Prefer deepseek-v4-flash.', tier: 'fast', inputPerMTokUsd: 0.14, outputPerMTokUsd: 0.28, contextTokens: 1_000_000, capabilities: CAPS_TEXT, released: '2024-12' },
    { modelId: 'deepseek-reasoner', label: 'DeepSeek Reasoner (alias → V4 Flash thinking)', description: 'Legacy alias. Prefer deepseek-v4-flash (thinking mode).', tier: 'flagship', inputPerMTokUsd: 0.14, outputPerMTokUsd: 0.28, contextTokens: 1_000_000, capabilities: CAPS_TEXT, released: '2025-01' },
  ],
  factory: openaiCompatibleFactory('deepseek', 'https://api.deepseek.com'),
});

export const IAMHC = defineProvider({
  id: 'iamhc',
  displayName: 'IAMHC API',
  familyName: 'Aggregate',
  keyHint: 'sk-…',
  description: 'IAMHC — aggregated API proxy with 25+ models across OpenAI, Anthropic, Gemini, and more.',
  pricingTier: 'low',
  baseURL: 'https://api.iamhc.cn/v1',
  defaultModels: {
    fundamental: 'DeepSeek-V4-Pro',
    technical: 'DeepSeek-V4-Flash',
    summary: 'Qwen3.6-35B-A3B',
    vision: 'Qwen3.5-397B-A17B',
    embedding: null,
  },
  bestFor: 'Multi-model proxy',
  supports: { vision: true, embedding: false },
  models: [
    { modelId: 'auto', label: 'Auto (routed)', description: 'Smart routing across all models.', tier: 'flagship', capabilities: CAPS_TEXT },
    { modelId: 'DeepSeek-V4-Pro', label: 'DeepSeek V4 Pro', description: 'Best reasoning model via proxy.', tier: 'flagship', capabilities: CAPS_TEXT },
    { modelId: 'DeepSeek-V4-Flash', label: 'DeepSeek V4 Flash', description: 'Fast balanced model.', tier: 'pro', capabilities: CAPS_TEXT },
    { modelId: 'Qwen3.5-397B-A17B', label: 'Qwen 3.5 397B (MoE)', description: 'Strong reasoning, vision-capable.', tier: 'flagship', capabilities: CAPS_FULL },
    { modelId: 'Qwen3.6-35B-A3B', label: 'Qwen 3.6 35B (MoE)', description: 'Fast light reasoning.', tier: 'lite', capabilities: CAPS_TEXT },
    { modelId: 'Kimi-K2.6', label: 'Kimi K2.6', description: 'Long context reasoning.', tier: 'pro', capabilities: CAPS_TEXT },
    { modelId: 'MiniMax-M3', label: 'MiniMax M3', description: 'General purpose model.', tier: 'pro', capabilities: CAPS_TEXT },
    { modelId: 'glm-4.7', label: 'GLM 4.7', description: 'ChatGLM series, Anthropic-compatible.', tier: 'pro', capabilities: CAPS_TEXT },
  ],
  factory: openaiCompatibleFactory('iamhc', 'https://api.iamhc.cn/v1'),
});
