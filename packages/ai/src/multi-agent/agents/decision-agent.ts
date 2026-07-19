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

// Decision Agent — fuses all specialist opinions into a final unified response.

import { generateText, streamText, convertToModelMessages, type Tool, type ModelMessage } from 'ai';
import { estimateCostUsd } from '../../cost';
import { withToolContext, type ToolContext } from '../../tool-context';
import { telemetryConfig } from '../../telemetry';
import { BaseAgent } from './base-agent';
import { buildSharedSystemPrompt, extractUserMessageText } from '../context';
import type { AgentName, AgentBias, ModelTier, AgentOpinion, SharedContext, MultiAgentEnv } from '../types';
import { AGENT_TIMEOUTS } from '../types';
import type { UserSettingsRow } from '@hamafx/db/schema';

export class DecisionAgent extends BaseAgent {
  readonly name: AgentName = 'decision';
  readonly modelTier: ModelTier = 'strong';

  systemPrompt(): string {
    return `You are the Decision Agent for HamaFX-Ai, the final voice in a multi-agent deliberation.

You receive structured opinions from specialist agents:
- Technical Agent: price action, indicators, structure
- Fundamental Agent: macro context, events, positioning
- Risk Agent: risk flags, worst-case scenarios, potential vetoes
- Sentiment Agent: news/social sentiment, contrarian signals

Your job:
1. Synthesize ALL opinions into a single coherent response
2. Highlight AGREEMENT (strong signal) and DISAGREEMENT (uncertainty)
3. Give a balanced recommendation with confidence level
4. Always lead with risk if the Risk Agent flagged "high" or "extreme"
5. If Risk Agent issued a "hardVeto", you MUST NOT recommend buying

## Response Format
Respond in natural language (not JSON) as if talking to the user directly.
Structure your response:
1. **Bottom Line** — 1-2 sentence summary with direction + confidence
2. **Technical Read** — Key levels and indicator summary
3. **Fundamental Context** — Macro backdrop and upcoming catalysts
4. **Risk Assessment** — What could go wrong
5. **Actionable Plan** — Entry zone, stop, target, position sizing guidance

If agents disagree, explicitly state: "Technical says X but Risk flags Y."
Transparency builds trust. Don't hide disagreement.

If a specialist agent is missing (unavailable), note it explicitly:
"Note: The [Agent] was unavailable for this analysis."

Be concise but thorough. Use markdown formatting for readability.`;
  }

  tools(): Record<string, Tool> { return {}; }

  protected parseOutput(text: string): { bias: AgentBias; confidence: number; reasoning: string; rawData: Record<string, unknown> } {
    const lower = text.toLowerCase();
    let bias: AgentBias = 'neutral';
    if (lower.includes('bullish') || lower.includes('buy') || lower.includes('long')) bias = 'bullish';
    else if (lower.includes('bearish') || lower.includes('sell') || lower.includes('short')) bias = 'bearish';
    return { bias, confidence: 0.7, reasoning: text.slice(0, 500), rawData: { responseLength: text.length } };
  }

  async fuse(
    opinions: AgentOpinion[],
    ctx: SharedContext,
    execCtx: { threadId: string; userId: string; env: MultiAgentEnv; signal: AbortSignal | null; userSettings: UserSettingsRow },
    onTextChunk?: (chunk: string) => void,
  ): Promise<{ text: string; costUsd: number; latencyMs: number; modelId: string }> {
    const startMs = Date.now();
    const { model, modelId } = this.resolveModel(ctx);
    const opinionsBlock = this.buildOpinionsBlock(opinions);
    const userText = extractUserMessageText(ctx.userMessage);
    const sharedPrompt = buildSharedSystemPrompt(ctx, null);
    const system = `${this.systemPrompt()}\n\n${sharedPrompt}`;
    const userMessage = `## User Question\n${userText}\n\n## Specialist Agent Opinions\n${opinionsBlock}\n\n## Your Task\nSynthesize the above opinions into a final response for the user. Follow the response format from your instructions.`;
    // Q3: include conversation history so follow-up turns have context.
    const historyMessages: ModelMessage[] = ctx.history && ctx.history.length > 0
      ? convertToModelMessages(ctx.history.filter((m) => m.role !== 'system'))
      : [];
    const messages: ModelMessage[] = [
      ...historyMessages,
      { role: 'user' as const, content: userMessage },
    ];
    const toolContext: ToolContext = {
      threadId: execCtx.threadId,
      userId: execCtx.userId,
      latestUserMessageText: userText,
      env: execCtx.env,
      signal: execCtx.signal,
      // B1 fix: use env.MAX_DAILY_USD instead of hardcoded 100.
      budget: { spent: 0, max: execCtx.userSettings.maxDailyUsd ?? execCtx.env.MAX_DAILY_USD },
      userSettings: execCtx.userSettings,
      toolTelemetryBuffer: [],  // M4: batch telemetry inserts
    };
    const timeoutMs = AGENT_TIMEOUTS[this.name] ?? 30_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // P2 fix: add { once: true } to prevent listener leak on long-lived signals.
    if (execCtx.signal) execCtx.signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      // P1-4/U1 — Use streamText for token-by-token fusion streaming.
      // On text deltas, invoke the callback so the route can emit SSE frames.
      // Falls back to generateText when no callback is provided (e.g. tests).
      if (onTextChunk) {
        const sResult = await withToolContext(toolContext, async () =>
          streamText({ model, system, messages, abortSignal: controller.signal, maxOutputTokens: 4000, ...telemetryConfig() }),
        );
        const latencyMs = Date.now() - startMs;
        let fullText = '';
        for await (const part of sResult.fullStream) {
          if (part.type === 'text-delta') {
            fullText += part.text;
            onTextChunk(part.text);
          }
        }
        // Wait for usage before returning
        const usage = await sResult.usage;
        const costUsd = estimateCostUsd(modelId, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);
        return { text: fullText, costUsd, latencyMs, modelId };
      }
      // Legacy: generateText for callers without streaming callback
      const result = await withToolContext(toolContext, async () => generateText({ model, system, messages, abortSignal: controller.signal, maxOutputTokens: 4000, ...telemetryConfig() }));
      const latencyMs = Date.now() - startMs;
      const costUsd = estimateCostUsd(modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0);
      return { text: result.text, costUsd, latencyMs, modelId };
    } finally { clearTimeout(timeout); }
  }

  private buildOpinionsBlock(opinions: AgentOpinion[]): string {
    if (opinions.length === 0) return 'No specialist agents were available for this analysis. Provide a general response based on your own knowledge.';
    return opinions.map((op) => {
      const name = op.agentName.charAt(0).toUpperCase() + op.agentName.slice(1);
      const confidencePct = Math.round(op.confidence * 100);
      const rawDataStr = JSON.stringify(op.rawData, null, 2);
      return `### ${name} Agent\n- **Bias:** ${op.bias}\n- **Confidence:** ${confidencePct}%\n- **Reasoning:** ${op.reasoning}\n- **Full Data:**\n\`\`\`json\n${rawDataStr}\n\`\`\``;
    }).join('\n\n---\n\n');
  }
}