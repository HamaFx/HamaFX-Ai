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

// Multi-Agent Orchestration — abstract base agent.

import { generateText, stepCountIs, type LanguageModel, type Tool } from 'ai';
import { z } from 'zod';
import { resolveChatModel, resolveModelForProvider, supportsPromptCaching, type ModelDomain } from '../../model';
import { estimateCostUsd } from '../../cost';
import { withToolContext, type ToolContext } from '../../tool-context';
import type { ProviderId } from '@hamafx/shared';
import type { SharedContext, AgentOpinion, AgentName, AgentBias, ModelTier } from '../types';
import { AGENT_TIMEOUTS } from '../types';
import { extractUserMessageText } from '../context';

/** Q1 fix — map ModelTier to the ModelDomain used by resolveChatModel's tier selection. */
function tierToDomain(tier: ModelTier): ModelDomain {
  switch (tier) {
    case 'fast': return 'summary';
    case 'mid': return 'technical';
    case 'strong': return 'fundamental';
  }
}

export const baseOpinionSchema = z.object({
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

export abstract class BaseAgent {
  abstract readonly name: AgentName;
  abstract readonly modelTier: ModelTier;
  abstract systemPrompt(): string;
  abstract tools(): Record<string, Tool>;
  protected abstract parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> };

  protected resolveModel(ctx: SharedContext): { model: LanguageModel; modelId: string; providerId: ProviderId } {
    const overrides = ctx.userSettings.agentModelOverrides;
    const agentOverride = overrides?.[this.name];
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
    const domain = tierToDomain(this.modelTier);
    const res = resolveChatModel(ctx.userSettings, ctx.env, domain);
    return { model: res.model, modelId: res.modelId, providerId: res.providerId };
  }

  async run(ctx: SharedContext): Promise<AgentOpinion> {
    const startMs = Date.now();
    const { model, modelId } = this.resolveModel(ctx);
    const sharedPrompt = ctx.snapshot ? `# LIVE MARKET CONTEXT\n${JSON.stringify(ctx.snapshot, null, 2)}\n` : '';
    const prefetchedPrompt = ctx.prefetchedData
      ? `\n\n${ctx.prefetchedData}\n\nPrefer the above pre-fetched data. Only call tools for data gaps or updates.\n`
      : '';
    const userText = extractUserMessageText(ctx.userMessage);
    const fullSystem = `${this.systemPrompt()}\n\n${sharedPrompt}${prefetchedPrompt}`;
    const toolContext: ToolContext = {
      threadId: ctx.threadId,
      userId: ctx.userId,
      latestUserMessageText: userText,
      env: ctx.env,
      signal: ctx.signal,
            // B1 fix: use env.MAX_DAILY_USD instead of hardcoded 100.
      budget: { spent: 0, max: ctx.userSettings.maxDailyUsd ?? ctx.env.MAX_DAILY_USD },
      userSettings: ctx.userSettings,
    };
    const timeoutMs = AGENT_TIMEOUTS[this.name] ?? 15_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (ctx.signal) ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const result = await withToolContext(toolContext, async () => generateText({
        model, system: fullSystem,
        ...(supportsPromptCaching(modelId)
          ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
          : {}),
        messages: [{ role: 'user' as const, content: userText }],
        tools: this.tools(),
        stopWhen: stepCountIs(ctx.env.MAX_TOOL_ITERATIONS ?? 6),
        abortSignal: controller.signal,
        maxOutputTokens: 3000,
      }));
      const latencyMs = Date.now() - startMs;
      const costUsd = estimateCostUsd(modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0);
      const parsed = this.parseOutput(result.text);
      return { agentName: this.name, bias: parsed.bias, confidence: parsed.confidence, reasoning: parsed.reasoning, rawData: parsed.rawData, costUsd, latencyMs, model: modelId };
    } finally { clearTimeout(timeout); }
  }

  protected safeParseJson(text: string): Record<string, unknown> | null {
    try { return JSON.parse(text); } catch {
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m?.[1]) { try { return JSON.parse(m[1].trim()); } catch { /* continue */ } }
      const f = text.indexOf('{'), l = text.lastIndexOf('}');
      if (f >= 0 && l > f) { try { return JSON.parse(text.slice(f, l + 1)); } catch { /* continue */ } }
      return null;
    }
  }
}