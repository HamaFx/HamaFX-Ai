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

import { generateText, type LanguageModel } from 'ai';
import { resolveChatModel } from '../../model';
import { estimateCostUsd } from '../../cost';
import { withToolContext, type ToolContext } from '../../tool-context';
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

  tools(): Record<string, import('ai').Tool> { return {}; }

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
  ): Promise<{ text: string; costUsd: number; latencyMs: number; modelId: string }> {
    const startMs = Date.now();
    const { model, modelId } = this.resolveModel(ctx);
    const opinionsBlock = this.buildOpinionsBlock(opinions);
    const userText = extractUserMessageText(ctx.userMessage);
    const sharedPrompt = buildSharedSystemPrompt(ctx, null);
    const system = `${this.systemPrompt()}\n\n${sharedPrompt}`;
    const userMessage = `## User Question\n${userText}\n\n## Specialist Agent Opinions\n${opinionsBlock}\n\n## Your Task\nSynthesize the above opinions into a final response for the user. Follow the response format from your instructions.`;
    const toolContext: ToolContext = { threadId: execCtx.threadId, userId: execCtx.userId, env: execCtx.env, signal: execCtx.signal, budget: { spent: 0, max: execCtx.userSettings.maxDailyUsd ?? 100 }, userSettings: execCtx.userSettings };
    const timeoutMs = AGENT_TIMEOUTS[this.name] ?? 30_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    if (execCtx.signal) execCtx.signal.addEventListener('abort', () => controller.abort(), { once: true });
    try {
      const result = await withToolContext(toolContext, async () => generateText({ model, system, messages: [{ role: 'user' as const, content: userMessage }], abortSignal: controller.signal, maxOutputTokens: 4000 }));
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