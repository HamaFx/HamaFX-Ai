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

import { createAnthropic } from '@ai-sdk/anthropic';
import { CAPS_FULL, defineProvider } from './helpers';
import type { ByokProviderSpec } from './types';

export const ANTHROPIC: ByokProviderSpec = defineProvider({
  id: 'anthropic',
  displayName: 'Anthropic (Claude)',
  familyName: 'Claude',
  keyHint: 'sk-ant-…',
  description: 'Claude Fable / Opus / Sonnet / Haiku — strong reasoning, long context, vision.',
  pricingTier: 'high',
  docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
  defaultModels: {
    fundamental: 'claude-opus-4-8',
    technical: 'claude-sonnet-5',
    summary: 'claude-haiku-4-5',
    vision: 'claude-sonnet-5',
    embedding: null,
  },
  bestFor: 'Deep reasoning + agents',
  supports: { vision: true, embedding: false },
  models: [
    { modelId: 'claude-fable-5', label: 'Claude Fable 5', description: 'Most capable widely-released Claude (2026).', tier: 'flagship', inputPerMTokUsd: 5, outputPerMTokUsd: 25, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-06' },
    { modelId: 'claude-opus-4-8', label: 'Claude Opus 4.8', description: 'Top agentic coding / enterprise reasoning.', tier: 'flagship', inputPerMTokUsd: 5, outputPerMTokUsd: 25, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-05' },
    { modelId: 'claude-sonnet-5', label: 'Claude Sonnet 5', description: 'Best balance of intelligence, speed, cost.', tier: 'pro', inputPerMTokUsd: 3, outputPerMTokUsd: 15, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-05' },
    { modelId: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Cheap, fast, near-Sonnet quality.', tier: 'fast', inputPerMTokUsd: 1, outputPerMTokUsd: 5, contextTokens: 200_000, capabilities: CAPS_FULL, released: '2025-10' },
    { modelId: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'Previous-gen Sonnet (still supported).', tier: 'pro', inputPerMTokUsd: 3, outputPerMTokUsd: 15, contextTokens: 200_000, capabilities: CAPS_FULL, released: '2025-09' },
    { modelId: 'claude-opus-4-6', label: 'Claude Opus 4.6', description: 'Previous Opus generation.', tier: 'flagship', inputPerMTokUsd: 5, outputPerMTokUsd: 25, contextTokens: 1_000_000, capabilities: CAPS_FULL, released: '2026-02' },
  ],
  factory: (apiKey) => {
    const provider = createAnthropic({ apiKey });
    return (modelId) => provider(modelId);
  },
});
