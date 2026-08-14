/**
 * Copyright 2026 Kestrel
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

import { convertToModelMessages, generateText, stepCountIs, type LanguageModel, type Tool } from 'ai';
import { z } from 'zod';
import { supportsPromptCaching } from '../../model';
import { checkBudgetAlertsAndThresholds, estimateCostUsd } from '../../cost';
import { withToolContext, type ToolContext } from '../../tool-context';
import { telemetryConfig } from '../../telemetry';
import { container } from '@kestrel/shared';
import { DB } from '../../tokens';
import type { SharedContext, AgentOpinion, AgentName, AgentBias, ModelTier } from '../types';
import { AGENT_TIMEOUTS } from '../types';
import { extractUserMessageText } from '../context';
import { responseLanguageInstruction } from '../../prompt/system';
import { resolveAgentModel, safeParseJson } from './agent-model';

export const baseOpinionSchema = z.object({
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

const GROQ_TOOL_LIMIT = 6;

/**
 * Groq's OpenAI-compatible function-calling models become unreliable when
 * presented with a large specialist tool menu. Keep the highest-priority
 * tools (agents declare them in priority order) while preserving the full
 * tool set for providers with stronger tool-call handling.
 */
export function limitToolsForProvider(
  modelId: string,
  tools: Record<string, Tool>,
): Record<string, Tool> {
  if (!modelId.startsWith('groq/') || Object.keys(tools).length <= GROQ_TOOL_LIMIT) {
    return tools;
  }
  return Object.fromEntries(Object.entries(tools).slice(0, GROQ_TOOL_LIMIT));
}

/** Extract tool names from an AI SDK response without coupling callers to provider shapes. */
export function extractToolNamesFromMessages(messages: readonly unknown[] | undefined): string[] {
  if (!messages) return [];
  const names = new Set<string>();
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const candidate = part as { type?: unknown; toolName?: unknown };
      if (candidate.type === 'tool-call' && typeof candidate.toolName === 'string') {
        names.add(candidate.toolName);
      }
    }
  }
  return [...names];
}
export abstract class BaseAgent {
  abstract readonly name: AgentName;
  abstract readonly modelTier: ModelTier;
  abstract systemPrompt(): string;
  abstract tools(): Record<string, Tool>;
  protected abstract parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> };

  protected resolveModel(ctx: SharedContext): { model: LanguageModel; modelId: string; providerId: ReturnType<typeof resolveAgentModel>['providerId'] } {
    return resolveAgentModel(ctx, this.name, this.modelTier);
  }

  async run(ctx: SharedContext): Promise<AgentOpinion> {
    const startMs = Date.now();
    const { model, modelId, providerId } = this.resolveModel(ctx);
    const providerBudget = await checkBudgetAlertsAndThresholds(ctx.userId, providerId);
    if (providerBudget.blocked) {
      throw new Error(providerBudget.blockedReason ?? `Provider ${providerId} spending limit exceeded`);
    }
    const sharedPrompt = ctx.snapshot ? `# LIVE MARKET CONTEXT\n${JSON.stringify(ctx.snapshot, null, 2)}\n` : '';
    const prefetchedPrompt = ctx.prefetchedData
      ? `\n\n${ctx.prefetchedData}\n\nPrefer the above pre-fetched data. Only call tools for data gaps or updates.\n`
      : '';
    const userText = extractUserMessageText(ctx.userMessage);
    const fullSystem = `${this.systemPrompt()}\n\n## RESPONSE LANGUAGE\n${responseLanguageInstruction(ctx.userSettings.language)}\n\n${sharedPrompt}${prefetchedPrompt}`;
    const historyMessages = ctx.history && ctx.history.length > 0
      ? convertToModelMessages(ctx.history.filter((message) => message.role !== 'system'))
      : [];
    const messages = [
      ...historyMessages,
      { role: 'user' as const, content: userText },
    ];
    const tools = limitToolsForProvider(modelId, this.tools());
    for (const disabledTool of ctx.userSettings.disabledTools ?? []) {
      delete tools[disabledTool];
    }
    const toolContext: ToolContext = {
      threadId: ctx.threadId,
      userId: ctx.userId,
      latestUserMessageText: userText,
      env: ctx.env,
      signal: ctx.signal,
      // B1 fix: use env.MAX_DAILY_USD instead of hardcoded 100.
      budget: { spent: 0, max: ctx.userSettings.maxDailyUsd ?? ctx.env.MAX_DAILY_USD },
      userSettings: ctx.userSettings,
      db: container.resolve(DB),  // P0-2 — inject DB client
      toolTelemetryBuffer: [],  // M4: batch telemetry inserts
    };
    const timeoutMs = AGENT_TIMEOUTS[this.name] ?? 15_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort(ctx.signal?.reason);
    if (ctx.signal) {
      if (ctx.signal.aborted) onParentAbort();
      else ctx.signal.addEventListener('abort', onParentAbort, { once: true });
    }
    try {
      const result = await withToolContext(toolContext, async () => generateText({
        model, system: fullSystem,
        ...telemetryConfig(),
        ...(supportsPromptCaching(modelId)
          ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
          : {}),
        messages,
        tools,
        stopWhen: stepCountIs(ctx.env.MAX_TOOL_ITERATIONS ?? 6),
        abortSignal: controller.signal,
        maxOutputTokens: 3000,
      }));
      const latencyMs = Date.now() - startMs;
      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      const costUsd = estimateCostUsd(modelId, inputTokens, outputTokens);
      const parsed = this.parseOutput(result.text);
      const toolNames = extractToolNamesFromMessages(result.response?.messages);
      const rawData = {
        ...parsed.rawData,
        _tools: toolNames,
      };
      return {
        agentName: this.name,
        bias: parsed.bias,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        rawData,
        costUsd,
        latencyMs,
        model: modelId,
        inputTokens,
        outputTokens,
        providerId,
        modelId,
      };
    } finally {
      clearTimeout(timeout);
      ctx.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  protected safeParseJson(text: string): Record<string, unknown> | null {
    return safeParseJson(text);
  }
}