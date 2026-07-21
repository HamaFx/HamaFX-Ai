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

// Shared agent helpers — extracted from base-agent.ts so that DecisionAgent
// (which is NOT a BaseAgent — it's a synthesizer, not a specialist) can
// reuse model resolution and JSON parsing without inheriting the
// specialist contract it doesn't honor (LSP-1 fix).

import type { LanguageModel } from 'ai';
import { resolveChatModel, resolveModelForProvider, supportsPromptCaching, TIER_TO_DOMAIN, type ModelDomain } from '../../model';
import type { ProviderId } from '@hamafx/shared';
import type { SharedContext, ModelTier, AgentName } from '../types';

/**
 * Map ModelTier to the ModelDomain used by resolveChatModel's tier selection.
 * Q1 fix — maps fast→summary, mid→technical, strong→fundamental.
 */
export function tierToDomain(tier: ModelTier): ModelDomain {
  const domain = TIER_TO_DOMAIN[tier];
  if (!domain) {
    // Safety net for unknown tiers — default to 'technical'.
    return 'technical';
  }
  return domain;
}

/**
 * Resolve a language model for an agent. Replaces the BaseAgent.resolveModel
 * instance method so DecisionAgent can call it without inheriting BaseAgent.
 *
 * Honours per-agent model overrides from userSettings, falling back to the
 * tier-based domain resolution.
 */
export function resolveAgentModel(
  ctx: SharedContext,
  agentName: AgentName,
  modelTier: ModelTier,
): { model: LanguageModel; modelId: string; providerId: ProviderId } {
  const overrides = ctx.userSettings.agentModelOverrides;
  const agentOverride = overrides?.[agentName];
  if (agentOverride && typeof agentOverride === 'string' && agentOverride.length > 0) {
    const sep = agentOverride.indexOf(':');
    if (sep >= 0) {
      const providerIdRaw = agentOverride.slice(0, sep) as ProviderId;
      try {
        const res = resolveModelForProvider(providerIdRaw, ctx.userSettings, ctx.env);
        return { model: res.model, modelId: `${providerIdRaw}/${agentOverride.slice(sep + 1)}`, providerId: providerIdRaw };
      } catch { /* fall through */ }
    }
  }
  // Q1 fix: pass the agent's model tier as a domain to resolveChatModel so
  // specialists can use different tiers (fast→summary, mid→technical, strong→fundamental).
  const domain = tierToDomain(modelTier);
  const res = resolveChatModel(ctx.userSettings, ctx.env, domain);
  return { model: res.model, modelId: res.modelId, providerId: res.providerId };
}

/**
 * Try to parse JSON from text, including from markdown code fences and
 * partial JSON embedded in prose. Returns null on failure.
 */
export function safeParseJson(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m?.[1]) { try { return JSON.parse(m[1].trim()); } catch { /* continue */ } }
    const f = text.indexOf('{'), l = text.lastIndexOf('}');
    if (f >= 0 && l > f) { try { return JSON.parse(text.slice(f, l + 1)); } catch { /* continue */ } }
    return null;
  }
}
