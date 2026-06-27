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

// Multi-Agent Orchestration — pipeline coordinator.

import { generateText, type LanguageModel } from 'ai';
import { resolveChatModel } from '../model';
import { estimateCostUsd, tryReserveBudget, applyBudgetDelta, BudgetExceededError } from '../cost';
import { withToolContext, type ToolContext } from '../tool-context';
import { buildSharedContext, buildSharedSystemPrompt, extractUserMessageText } from './context';
import { selectAgents, resolveMode } from './modes';
import { saveAgentOpinions } from './persistence';
import { TechnicalAgent } from './agents/technical-agent';
import { FundamentalAgent } from './agents/fundamental-agent';
import { RiskAgent } from './agents/risk-agent';
import { SentimentAgent } from './agents/sentiment-agent';
import { DecisionAgent } from './agents/decision-agent';
import type { BaseAgent } from './agents/base-agent';
import type {
  AnalysisMode, ResolvedMode, AgentOpinion, AgentName,
  SharedContext, MultiAgentResult, ProgressEvent, MultiAgentEnv,
} from './types';
import { AGENT_TIMEOUTS, MODE_COST_ESTIMATE } from './types';
import type { UserSettingsRow } from '@hamafx/db/schema';
import type { UIMessage } from 'ai';

const AGENT_FACTORIES: Record<AgentName, () => BaseAgent> = {
  technical: () => new TechnicalAgent(),
  fundamental: () => new FundamentalAgent(),
  risk: () => new RiskAgent(),
  sentiment: () => new SentimentAgent(),
  decision: () => new DecisionAgent(),
};

export interface RunMultiAgentArgs {
  threadId: string;
  userId: string;
  userMessage: UIMessage;
  history: UIMessage[];
  userSettings: UserSettingsRow;
  displayName: string | null;
  customInstructions?: string;
  env: MultiAgentEnv;
  signal: AbortSignal | null;
  analysisMode: AnalysisMode;
  /** ID of the assistant message that will hold the final response.
   *  Required for persisting agent opinions alongside the message. */
  messageId?: string;
  onProgress?: (event: ProgressEvent) => void;
}

export async function runMultiAgentChat(args: RunMultiAgentArgs): Promise<MultiAgentResult> {
  const { threadId, userId, userMessage, history, userSettings, displayName, customInstructions, env, signal, analysisMode, messageId, onProgress } = args;
  const startMs = Date.now();
  const userText = extractUserMessageText(userMessage);
  const mode = resolveMode(analysisMode, userText);

  if (mode === 'single') {
    throw new Error('runMultiAgentChat called with single mode — use runChat() instead');
  }

  // ── Budget guardrail ── reserve estimated cost upfront ──
  const estimatedCost = MODE_COST_ESTIMATE[mode] ?? 0.025;
  const maxDailyUsd = userSettings.maxDailyUsd ?? 100;
  const reservation = await tryReserveBudget(userId, estimatedCost, maxDailyUsd);
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }

  const symbol = userSettings.defaultSymbol ?? 'XAUUSD';
  const ctxArgs: Parameters<typeof buildSharedContext>[0] = { symbol, userId, userMessage, history, userSettings, displayName, env, signal };
  if (customInstructions !== undefined) ctxArgs.customInstructions = customInstructions;
  const ctx = await buildSharedContext(ctxArgs);

  const specialistNames = selectAgents(mode);
  const specialists = specialistNames.map((name) => AGENT_FACTORIES[name]());

  onProgress?.({ type: 'specialists_start', agents: specialistNames });

  const opinions = await Promise.all(
    specialists.map(async (agent) => {
      onProgress?.({ type: 'agent_start', agent: agent.name });
      try {
        const agentCtx: SharedContext = { ...ctx };
        const toolContext: ToolContext = {
          threadId, userId, env, signal,
          budget: { spent: 0, max: userSettings.maxDailyUsd ?? 100 },
          userSettings,
        };
        const opinion = await withToolContext(toolContext, () => agent.run(agentCtx));
        onProgress?.({ type: 'agent_done', agent: agent.name, opinion });
        return opinion;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[multi-agent] ${agent.name} failed`, err);
        onProgress?.({ type: 'agent_error', agent: agent.name, error: msg });
        return null;
      }
    }),
  );

  const validOpinions = opinions.filter((o): o is AgentOpinion => o !== null);

  onProgress?.({ type: 'fusion_start' });

  const decisionAgent = new DecisionAgent();
  let finalText: string;
  let decisionCostUsd = 0;

  try {
    const decisionResult = await decisionAgent.fuse(validOpinions, ctx, { threadId, userId, env, signal, userSettings });
    finalText = decisionResult.text;
    decisionCostUsd = decisionResult.costUsd;
    onProgress?.({ type: 'fusion_done' });
  } catch (err) {
    console.error('[multi-agent] Decision agent failed', err);
    onProgress?.({ type: 'fusion_done' });
    if (validOpinions.length > 0) {
      finalText = validOpinions
        .map((o) => `**${o.agentName.charAt(0).toUpperCase() + o.agentName.slice(1)} Agent** (${o.bias}, ${Math.round(o.confidence * 100)}% confidence)\n${o.reasoning}`)
        .join('\n\n---\n\n');
      finalText = `⚠️ The Decision agent encountered an error. Here are the individual specialist opinions:\n\n${finalText}`;
    } else {
      finalText = 'I apologize, but all analysis agents encountered errors. Please try again or switch to single-agent mode.';
    }
  }

  const totalCostUsd = validOpinions.reduce((sum, o) => sum + o.costUsd, 0) + decisionCostUsd;
  const totalLatencyMs = Date.now() - startMs;

  // ── Budget reconciliation ── adjust reserved estimate to actual cost ──
  const costDelta = totalCostUsd - estimatedCost;
  if (Math.abs(costDelta) > 0.0001) {
    await applyBudgetDelta(userId, costDelta).catch((err) =>
      console.warn('[multi-agent] applyBudgetDelta failed', err),
    );
  }

  // ── Persist agent opinions ── link to the assistant message ──
  if (messageId && validOpinions.length > 0) {
    await saveAgentOpinions({
      userId, threadId, messageId, analysisMode: mode,
      opinions: validOpinions.map((o) => ({
        agentName: o.agentName, bias: o.bias, confidence: o.confidence,
        reasoning: o.reasoning, rawData: o.rawData, model: o.model,
        costUsd: o.costUsd, latencyMs: o.latencyMs,
      })),
    }).catch((err) => console.warn('[multi-agent] saveAgentOpinions failed', err));
  }

  return { finalText, agentOpinions: validOpinions, totalCostUsd, totalLatencyMs, mode };
}