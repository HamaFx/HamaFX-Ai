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

// Multi-Agent Orchestration — pipeline coordinator.

import { tryReserveBudget, applyBudgetDelta, BudgetExceededError, checkBudgetAlertsAndThresholds, DEFAULT_MAX_DAILY_USD } from '../cost';
import { resolveChatModel } from '../model';
import { buildSharedContext, extractUserMessageText } from './context';
import { limitConcurrency } from '../util/concurrency';
import { selectAgents, resolveMode } from './modes';
import { saveAgentOpinions } from './persistence';
import { appendUserMessage, appendAssistantMessage, recordTelemetry } from '../persistence';
import { enforceCitations } from '../verification';
import { logErrorContext, createCategorizedLogger } from '@kestrel/shared/logger';
import { TechnicalAgent } from './agents/technical-agent';
import { FundamentalAgent } from './agents/fundamental-agent';
import { RiskAgent } from './agents/risk-agent';
import { SentimentAgent } from './agents/sentiment-agent';
import { DecisionAgent } from './agents/decision-agent';
import type { BaseAgent } from './agents/base-agent';
import type {
  AnalysisMode, AgentOpinion, SpecialistAgentName,
  SharedContext, MultiAgentResult, ProgressEvent, MultiAgentEnv, ResolvedMode,
} from './types';
import { MODE_COST_ESTIMATE } from './types';
import type { UserSettingsRow } from '@kestrel/db/schema';
import type { UIMessage } from 'ai';

const mlog = createCategorizedLogger('ai', { component: 'multi-agent' });

// LSP-1 fix: DecisionAgent is NOT a BaseAgent (it's a synthesizer with fuse(),
// not run()). The factory map is typed SpecialistAgentName so 'decision'
// CANNOT be accidentally added — the type system enforces the separation.
const AGENT_FACTORIES: Record<SpecialistAgentName, () => BaseAgent> = {
  technical: () => new TechnicalAgent(),
  fundamental: () => new FundamentalAgent(),
  risk: () => new RiskAgent(),
  sentiment: () => new SentimentAgent(),
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
  onProgress?: (event: ProgressEvent) => void;
  /** P1-4/U1 — token-by-token fusion streaming callback. */
  onTextChunk?: (chunk: string) => void;
  /** Durable key used to make worker retries message-idempotent. */
  idempotencyKey?: string;
}

export async function runMultiAgentChat(args: RunMultiAgentArgs): Promise<MultiAgentResult> {
  const { threadId, userId, userMessage, history, userSettings, displayName, customInstructions, env, signal, analysisMode, onProgress, onTextChunk } = args;
  const startMs = Date.now();
  const userText = extractUserMessageText(userMessage);
  const mode = resolveMode(analysisMode, userText);

  if (mode === 'single') {
    throw new Error('runMultiAgentChat called with single mode — use runChat() instead');
  }

  // ── Budget guardrail ── reserve estimated cost upfront ──
  // B1 fix: use env.MAX_DAILY_USD instead of hardcoded 100.
  const estimatedCost = MODE_COST_ESTIMATE[mode] ?? 0.025;
  const maxDailyUsd = userSettings.maxDailyUsd ?? env.MAX_DAILY_USD ?? DEFAULT_MAX_DAILY_USD;
  const reservation = await tryReserveBudget(userId, estimatedCost, maxDailyUsd);
  if (!reservation.ok) {
    throw new BudgetExceededError(reservation.spent, reservation.max);
  }

  // Every operation after a successful reservation must either reconcile or
  // release it. Provider resolution, budget-alert checks, and message
  // persistence can all fail before the main agent try/finally begins.
  let effectiveMode: ResolvedMode = mode;
  const symbol = userSettings.defaultSymbol ?? 'XAUUSD';
  let setupComplete = false;
  let validOpinions: AgentOpinion[] = [];
  let finalText = '';
  let decisionCostUsd = 0;
  let decisionInputTokens = 0;
  let decisionOutputTokens = 0;
  let decisionModelId = '';
  let decisionProviderId = '';
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  try {
    // B2 fix — enforce monthly budget + provider thresholds before expensive multi-agent turns.
    // Resolve the active provider once for the budget check (reuse single-agent semantics).
    const activeProvider = resolveChatModel(userSettings, env).providerId;
    const budgetCheck = await checkBudgetAlertsAndThresholds(userId, activeProvider);
    if (budgetCheck.blocked) {
      throw new Error(budgetCheck.blockedReason ?? 'Monthly budget limit reached');
    }
    // A user-selected analysis mode is never silently downgraded. The
    // non-essential flag controls optional tools in single-agent turns;
    // explicit full mode remains a four-specialist request. The hard
    // monthly limit still blocks the turn at 100%.
    if (budgetCheck.nonEssentialDisabled && mode === 'full') {
      mlog.warn('monthly budget threshold reached; preserving explicit full mode', { userId });
    }
    effectiveMode = mode;

    // ── Persist the user message first ──
    // This ensures the conversation survives even if all agents fail.
    // Do this AFTER budget reservation succeeds but BEFORE any agent work.
    await appendUserMessage(
      userId,
      threadId,
      userMessage,
      args.idempotencyKey ? { idempotencyKey: `${args.idempotencyKey}:user` } : undefined,
    );

    setupComplete = true;

    // ── Run specialists + fusion with budget-leak guard ──
    // Wrap the entire execution from shared-context build through
    // reconciliation in try/finally so that any throw (buildSharedContext,
    // Promise.all, fuse, etc.) before reconciliation releases the budget
    // reservation. Without this guard repeated failures inflate
    // daily_ai_spend and prematurely trip the BudgetExceededError guardrail.
    let reconciled = false;

  try {
    const ctxArgs: Parameters<typeof buildSharedContext>[0] = { symbol, userId, threadId, userMessage, history, userSettings, displayName, env, signal };
    if (customInstructions !== undefined) ctxArgs.customInstructions = customInstructions;
    const ctx = await buildSharedContext(ctxArgs);
    const specialistNames = selectAgents(effectiveMode);
    const specialists = specialistNames.map((name) => AGENT_FACTORIES[name]());

    onProgress?.({ type: 'specialists_start', agents: specialistNames });

    // PERF-5: cap specialist fan-out concurrency to avoid 429 bursts
    // on low-tier BYOK keys. Default 3, minimum 1, overridable via env.
    const concurrency = Math.max(1, env.MULTI_AGENT_CONCURRENCY ?? 3);
    const limit = limitConcurrency(concurrency);
    const failedAgents: string[] = [];
    const opinions = await Promise.all(
      specialists.map(async (agent) => {
        return limit(async () => {
          const agentStartMs = Date.now();
          onProgress?.({ type: 'agent_start', agent: agent.name });
          try {
            const agentCtx: SharedContext = { ...ctx };
            const opinion = await agent.run(agentCtx);
            onProgress?.({ type: 'agent_done', agent: agent.name, opinion });
            return opinion;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            failedAgents.push(agent.name);
            logErrorContext(err, 'multi-agent/agent_failed', { agentName: agent.name }, 'ai');
            void recordTelemetry({
              userId,
              threadId,
              messageId: null,
              model: `multi-agent/${agent.name}`,
              inputTokens: 0,
              outputTokens: 0,
              toolCalls: 0,
              ms: Date.now() - agentStartMs,
              kind: `multi_specialist_${agent.name}_failed` as
                'multi_specialist_technical_failed' |
                'multi_specialist_fundamental_failed' |
                'multi_specialist_risk_failed' |
                'multi_specialist_sentiment_failed',
            }).catch((telemetryErr) => mlog.warn('specialist failure telemetry failed', { err: String(telemetryErr) }));
            onProgress?.({ type: 'agent_error', agent: agent.name, error: msg });
            return null;
          }
        });
      }),
    );

    validOpinions = opinions.filter((o): o is AgentOpinion => o !== null);

    // P3: record per-specialist telemetry rows for usage attribution.
    for (const op of validOpinions) {
      void recordTelemetry({
        userId,
        threadId,
        messageId: null,
        model: op.model,
        inputTokens: op.inputTokens ?? 0,
        outputTokens: op.outputTokens ?? 0,
        toolCalls: 0,
        ms: op.latencyMs,
        kind: `multi_specialist_${op.agentName}` as const,
      }).catch((err) => mlog.warn('specialist telemetry failed', { err: String(err) }));
    }

    onProgress?.({ type: 'fusion_start' });

    const decisionAgent = new DecisionAgent();

    try {
      const decisionResult = await decisionAgent.fuse(
        validOpinions,
        ctx,
        {
          threadId,
          userId,
          env,
          signal,
          userSettings,
          unavailableAgents: failedAgents,
        },
        onTextChunk,
      );
      finalText = decisionResult.text;
      decisionCostUsd = decisionResult.costUsd;
      decisionInputTokens = decisionResult.inputTokens ?? 0;
      decisionOutputTokens = decisionResult.outputTokens ?? 0;
      decisionModelId = decisionResult.modelId;
      decisionProviderId = decisionResult.providerId;
      onProgress?.({ type: 'fusion_done' });
    } catch (err) {
      logErrorContext(err, 'multi-agent/decision_agent_failed', {}, 'ai');
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

    totalCostUsd = validOpinions.reduce((sum, o) => sum + o.costUsd, 0) + decisionCostUsd;
    totalLatencyMs = Date.now() - startMs;

    if (decisionModelId) {
      void recordTelemetry({
        userId,
        threadId,
        messageId: null,
        model: decisionModelId,
        inputTokens: decisionInputTokens,
        outputTokens: decisionOutputTokens,
        toolCalls: 0,
        ms: totalLatencyMs,
        kind: 'multi_specialist_decision',
      }).catch((err) => mlog.warn('decision telemetry failed', { err: String(err) }));
    }

    // ── Budget reconciliation ── adjust reserved estimate to actual cost ──
    // Always reconcile, even when totalCostUsd is 0 (all specialists failed).
    const costDelta = totalCostUsd - estimatedCost;
    await applyBudgetDelta(userId, costDelta).catch((err) =>
      mlog.warn('applyBudgetDelta failed', { err: String(err) }),
    );
    reconciled = true;
    } finally {
      if (!reconciled) {
        // Release the full reservation — any path that throws before
        // reconciliation must not leave the reservation stuck.
        await applyBudgetDelta(userId, -estimatedCost).catch((err) =>
          mlog.warn('failed to release budget reservation after error', { err: String(err) }),
        );
      }
    }
  } catch (err) {
    // The reservation was created before the guarded setup stage. Release it
    // only when provider checks, budget checks, or initial persistence fail.
    // Errors from the main execution path already release in its inner
    // finally block.
    if (!setupComplete) {
      await applyBudgetDelta(userId, -estimatedCost).catch((releaseErr) =>
        mlog.warn('failed to release budget reservation during setup failure', { err: String(releaseErr) }),
      );
    }
    throw err;
  }

  // ── Q2: Citation enforcement on multi-agent output ──
  // The fusion agent has no tools, so we pass the union of specialist tool names
  // as if they were "invoked" — the numbers/claims in the final answer come from
  // the specialists' tool results. A soft warning is correct because the data
  // wasn't verified by a tool call in the fusion turn itself.
  const specialistToolNames = [...new Set(validOpinions.flatMap((o) => {
    const rd = o.rawData as Record<string, unknown>;
    return Array.isArray(rd._tools) ? (rd._tools as string[]) : [];
  }))];
  let citationWarning: { type: string; unsupportedClaims: string[]; toolsInvoked: string[]; stance: string; createdAt: number } | null = null;
  try {
    citationWarning = enforceCitations({
      text: finalText,
      // Pass specialist tool names as if they were invoked this turn.
      // Q2: The fusion agent has no tools, so we construct synthetic tool-call
      // content parts that `readToolCallNames` (verification.ts) can recognize.
      // This is intentionally coupled to verification.ts's shape expectations.
      responseMessages: specialistToolNames.length > 0
        ? [{ content: specialistToolNames.map((t) => ({ type: 'tool-call' as const, toolName: t })) }]
        : [],
    });
  } catch { /* citation enforcer should never crash the pipeline */ }

  // ── Persist the assistant message ──
  let parts: UIMessage['parts'] = [{ type: 'text', text: finalText }];
  if (citationWarning) {
    parts = [...parts, citationWarning as unknown as UIMessage['parts'][number]];
  }
  const assistantUi: UIMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts,
  };

  // Persist the assistant first and use the database-returned ID for every
  // dependent row. The UI message ID is not necessarily the database ID,
  // and retry idempotency may return an already-existing assistant row.
  const persistedAssistant = await appendAssistantMessage(
    userId,
    threadId,
    assistantUi,
    args.idempotencyKey ? { idempotencyKey: `${args.idempotencyKey}:assistant` } : undefined,
  );
  const persistedMessageId = persistedAssistant.messageId;

  if (validOpinions.length > 0) {
    await saveAgentOpinions({
      userId, threadId, messageId: persistedMessageId, analysisMode: effectiveMode,
      opinions: validOpinions.map((o) => ({
        agentName: o.agentName, bias: o.bias, confidence: o.confidence,
        reasoning: o.reasoning, rawData: o.rawData, model: o.model,
        costUsd: o.costUsd, latencyMs: o.latencyMs,
      })),
    }).catch((err) => logErrorContext(err, 'multi-agent/save_opinions_failed', {}, 'ai'));
  }

  // ── Record telemetry for the multi-agent turn ──
  void recordTelemetry({
    userId,
    threadId,
    messageId: persistedMessageId,
    model: `multi-agent/${effectiveMode}`,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    ms: totalLatencyMs,
    kind: 'multi_agent_turn',
  }).catch((err) => mlog.warn('recordTelemetry failed', { err: String(err) }));

  return {
    finalText,
    agentOpinions: validOpinions,
    totalCostUsd,
    totalLatencyMs,
    mode: effectiveMode,
    messageId: persistedMessageId,
    inputTokens: decisionInputTokens,
    outputTokens: decisionOutputTokens,
    ...(decisionProviderId ? { providerId: decisionProviderId } : {}),
    ...(decisionModelId ? { modelId: decisionModelId } : {}),
  };
}