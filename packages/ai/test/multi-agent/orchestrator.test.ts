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

// Characterization tests for runMultiAgentChat (the Full-mode committee
// pipeline). These lock the glue behaviour — budget reserve/reconcile/release,
// strict vs non-strict specialist/decision failure handling, citation
// enforcement, opinion persistence, and progress/stream callbacks — with
// mocked specialist + decision agents and DB-touching dependencies.
// Individual agents, modes, context building, and fusion formatting have
// their own focused unit tests; this suite covers the orchestration between
// them.

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@kestrel/shared';

import {
  runMultiAgentChat,
  MultiAgentStrictFailureError,
  type RunMultiAgentArgs,
} from '../../src/multi-agent/orchestrator';
import type { AgentOpinion } from '../../src/multi-agent/types';

const mocks = vi.hoisted(() => ({
  // cost / budget
  mockTryReserveBudget: vi.fn(),
  mockApplyBudgetDelta: vi.fn(),
  mockReconcileBudgetReservation: vi.fn(),
  mockReleaseBudgetReservation: vi.fn(),
  mockCheckBudgetAlertsAndThresholds: vi.fn(),
  // model
  mockResolveChatModel: vi.fn(),
  // context
  mockBuildSharedContext: vi.fn(),
  // persistence
  mockSaveAgentOpinions: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockAppendAssistantMessage: vi.fn(),
  mockRecordTelemetry: vi.fn(),
  // verification
  mockEnforceCitations: vi.fn(),
  // specialist agents
  mockTechnicalRun: vi.fn(),
  mockFundamentalRun: vi.fn(),
  mockRiskRun: vi.fn(),
  mockSentimentRun: vi.fn(),
  // decision (fusion) agent
  mockDecisionFuse: vi.fn(),
}));

vi.mock('../../src/cost', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../src/cost');
  return {
    ...actual,
    tryReserveBudget: mocks.mockTryReserveBudget,
    applyBudgetDelta: mocks.mockApplyBudgetDelta,
    reconcileBudgetReservation: mocks.mockReconcileBudgetReservation,
    releaseBudgetReservation: mocks.mockReleaseBudgetReservation,
    checkBudgetAlertsAndThresholds: mocks.mockCheckBudgetAlertsAndThresholds,
  };
});

vi.mock('../../src/model', () => ({
  resolveChatModel: mocks.mockResolveChatModel,
}));

vi.mock('../../src/multi-agent/context', () => ({
  buildSharedContext: mocks.mockBuildSharedContext,
  extractUserMessageText: (message: { parts: Array<{ type: string; text?: string }> }) =>
    message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join(' '),
}));

vi.mock('../../src/multi-agent/persistence', () => ({
  saveAgentOpinions: mocks.mockSaveAgentOpinions,
}));

vi.mock('../../src/persistence', () => ({
  appendUserMessage: mocks.mockAppendUserMessage,
  appendAssistantMessage: mocks.mockAppendAssistantMessage,
  recordTelemetry: mocks.mockRecordTelemetry,
}));

vi.mock('../../src/verification', () => ({
  enforceCitations: mocks.mockEnforceCitations,
}));

vi.mock('../../src/multi-agent/agents/technical-agent', () => ({
  TechnicalAgent: class {
    readonly name = 'technical';
    run = (ctx: unknown) => mocks.mockTechnicalRun(ctx);
  },
}));

vi.mock('../../src/multi-agent/agents/fundamental-agent', () => ({
  FundamentalAgent: class {
    readonly name = 'fundamental';
    run = (ctx: unknown) => mocks.mockFundamentalRun(ctx);
  },
}));

vi.mock('../../src/multi-agent/agents/risk-agent', () => ({
  RiskAgent: class {
    readonly name = 'risk';
    run = (ctx: unknown) => mocks.mockRiskRun(ctx);
  },
}));

vi.mock('../../src/multi-agent/agents/sentiment-agent', () => ({
  SentimentAgent: class {
    readonly name = 'sentiment';
    run = (ctx: unknown) => mocks.mockSentimentRun(ctx);
  },
}));

vi.mock('../../src/multi-agent/agents/decision-agent', () => ({
  DecisionAgent: class {
    readonly name = 'decision';
    fuse = (opinions: unknown, ctx: unknown, execCtx: unknown, onTextChunk: unknown) =>
      mocks.mockDecisionFuse(opinions, ctx, execCtx, onTextChunk);
  },
}));

// ── Shared fixtures ─────────────────────────────────────────────────────────

const userSettings = {
  defaultSymbol: 'XAUUSD',
  maxDailyUsd: 5,
  language: 'en',
  timezone: 'UTC',
} as never;

const env = {
  MULTI_AGENT_CONCURRENCY: 3,
  MAX_DAILY_USD: 5,
  AI_DEFAULT_MODEL: 'google/gemini-2.5-flash',
} as never;

function makeUserMessage(text = 'Should I buy XAUUSD?'): UIMessage {
  return { id: 'user-msg-1', role: 'user', parts: [{ type: 'text', text }] } as UIMessage;
}

function makeOpinion(
  agentName: AgentOpinion['agentName'],
  overrides: Partial<AgentOpinion> = {},
): AgentOpinion {
  return {
    agentName,
    bias: 'bullish',
    confidence: 0.8,
    reasoning: `${agentName} says bullish.`,
    rawData: { _tools: [] },
    costUsd: 0.01,
    latencyMs: 100,
    model: 'google/gemini-2.5-flash',
    inputTokens: 10,
    outputTokens: 5,
    providerId: 'google',
    modelId: 'google/gemini-2.5-flash',
    ...overrides,
  };
}

function makeDecisionResult(overrides: Record<string, unknown> = {}) {
  return {
    text: 'Fused response.',
    costUsd: 0.01,
    latencyMs: 50,
    modelId: 'google/gemini-2.5-pro',
    inputTokens: 20,
    outputTokens: 10,
    providerId: 'google',
    ...overrides,
  };
}

function makeArgs(overrides: Partial<RunMultiAgentArgs> = {}): RunMultiAgentArgs {
  return {
    threadId: 'thread-1',
    userId: 'user-1',
    userMessage: makeUserMessage(),
    history: [],
    userSettings,
    displayName: 'Ada',
    env,
    signal: null,
    analysisMode: 'full',
    ...overrides,
  } as RunMultiAgentArgs;
}

beforeEach(() => {
  vi.clearAllMocks();
  metrics.reset();

  mocks.mockTryReserveBudget.mockResolvedValue({ ok: true, spent: 0.01, max: 5, reservationId: 'res-1' });
  mocks.mockApplyBudgetDelta.mockResolvedValue(undefined);
  mocks.mockReconcileBudgetReservation.mockResolvedValue(true);
  mocks.mockReleaseBudgetReservation.mockResolvedValue(true);
  mocks.mockCheckBudgetAlertsAndThresholds.mockResolvedValue({ blocked: false, nonEssentialDisabled: false });
  mocks.mockResolveChatModel.mockReturnValue({ providerId: 'google', modelId: 'google/gemini-2.5-flash' });
  mocks.mockBuildSharedContext.mockResolvedValue({ symbol: 'XAUUSD', snapshot: { prices: {} }, prefetchedData: undefined });
  mocks.mockSaveAgentOpinions.mockResolvedValue(undefined);
  mocks.mockAppendUserMessage.mockResolvedValue(undefined);
  mocks.mockAppendAssistantMessage.mockResolvedValue({ messageId: 'assistant-message-1' });
  mocks.mockRecordTelemetry.mockResolvedValue(undefined);
  mocks.mockEnforceCitations.mockReturnValue(null);
  mocks.mockTechnicalRun.mockResolvedValue(makeOpinion('technical'));
  mocks.mockFundamentalRun.mockResolvedValue(makeOpinion('fundamental'));
  mocks.mockRiskRun.mockResolvedValue(makeOpinion('risk'));
  mocks.mockSentimentRun.mockResolvedValue(makeOpinion('sentiment'));
  mocks.mockDecisionFuse.mockResolvedValue(makeDecisionResult());
});

// ── Happy path ─────────────────────────────────────────────────────────────

describe('runMultiAgentChat — happy path', () => {
  it('runs the full committee and reconciles the reservation', async () => {
    const result = await runMultiAgentChat(makeArgs({ analysisMode: 'full' }));

    expect(result.finalText).toBe('Fused response.');
    expect(result.agentOpinions).toHaveLength(4);
    expect(result.mode).toBe('full');
    expect(result.messageId).toBe('assistant-message-1');

    // Full mode estimates 0.04 USD upfront.
    expect(mocks.mockTryReserveBudget).toHaveBeenCalledWith('user-1', 0.04, 5);
    expect(mocks.mockAppendUserMessage).toHaveBeenCalled();
    expect(mocks.mockDecisionFuse).toHaveBeenCalledTimes(1);
    expect(mocks.mockSaveAgentOpinions).toHaveBeenCalledTimes(1);

    const assistantCall = mocks.mockAppendAssistantMessage.mock.calls[0];
    expect(assistantCall?.[2]).toMatchObject({
      role: 'assistant',
      parts: [{ type: 'text', text: 'Fused response.' }],
    });

    // Reconciled once, never released on success.
    expect(mocks.mockReconcileBudgetReservation).toHaveBeenCalledWith('res-1', expect.any(Number));
    expect(mocks.mockReleaseBudgetReservation).not.toHaveBeenCalled();

    expect(metrics.snapshot().counters['chat_turn_total{result=ok}']).toBe(1);
  });

  it('forwards fusion text chunks and emits progress events', async () => {
    const onTextChunk = vi.fn();
    const onProgress = vi.fn();
    await runMultiAgentChat(makeArgs({ onTextChunk, onProgress }));

    expect(mocks.mockDecisionFuse).toHaveBeenCalledWith(
      expect.any(Array),
      expect.anything(),
      expect.anything(),
      onTextChunk,
    );
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'specialists_start' }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent_start' }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'fusion_start' }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'fusion_done' }));
  });
});

// ── Mode routing ───────────────────────────────────────────────────────────

describe('runMultiAgentChat — mode routing', () => {
  it('throws for single mode before reserving budget', async () => {
    await expect(runMultiAgentChat(makeArgs({ analysisMode: 'single' })))
      .rejects.toThrow('use runChat() instead');
    expect(mocks.mockTryReserveBudget).not.toHaveBeenCalled();
  });
});

// ── Budget guardrails ──────────────────────────────────────────────────────

describe('runMultiAgentChat — budget guardrails', () => {
  it('throws BudgetExceededError when the reservation is denied', async () => {
    mocks.mockTryReserveBudget.mockResolvedValue({ ok: false, spent: 5, max: 5 });

    await expect(runMultiAgentChat(makeArgs())).rejects.toThrow('Daily AI budget exceeded');
    expect(mocks.mockAppendUserMessage).not.toHaveBeenCalled();
  });

  it('releases the reservation when the monthly budget check blocks the turn', async () => {
    mocks.mockCheckBudgetAlertsAndThresholds.mockResolvedValue({
      blocked: true,
      blockedReason: 'Monthly budget limit reached',
      nonEssentialDisabled: true,
    });

    await expect(runMultiAgentChat(makeArgs())).rejects.toThrow('Monthly budget limit reached');
    expect(mocks.mockAppendUserMessage).not.toHaveBeenCalled();
    expect(mocks.mockReleaseBudgetReservation).toHaveBeenCalledWith('res-1');
  });

  it('releases the reservation and rethrows when reconciliation fails', async () => {
    mocks.mockReconcileBudgetReservation.mockRejectedValue(new Error('reconcile failed'));

    await expect(runMultiAgentChat(makeArgs())).rejects.toThrow('reconcile failed');
    expect(mocks.mockReleaseBudgetReservation).toHaveBeenCalledWith('res-1');
  });
});

// ── Specialist failure handling ────────────────────────────────────────────

describe('runMultiAgentChat — specialist failure handling', () => {
  it('fails strict Full mode when a specialist errors, with no partial answer', async () => {
    mocks.mockRiskRun.mockRejectedValue(new Error('risk agent crashed'));

    const err = await runMultiAgentChat(makeArgs({ analysisMode: 'full' })).catch((e) => e);

    expect(err).toBeInstanceOf(MultiAgentStrictFailureError);
    expect(err.code).toBe('MULTI_AGENT_INCOMPLETE');
    expect(err.stage).toBe('specialists');
    expect(err.failedAgents).toEqual(['risk']);
    expect(mocks.mockDecisionFuse).not.toHaveBeenCalled();
    expect(mocks.mockAppendAssistantMessage).not.toHaveBeenCalled();
    expect(mocks.mockReleaseBudgetReservation).toHaveBeenCalledWith('res-1');
  });

  it('continues in Standard mode when a specialist fails (non-strict)', async () => {
    mocks.mockFundamentalRun.mockRejectedValue(new Error('fundamental crashed'));

    const result = await runMultiAgentChat(makeArgs({ analysisMode: 'standard' }));

    expect(result.finalText).toBe('Fused response.');
    expect(result.agentOpinions).toHaveLength(1);
    expect(result.agentOpinions[0]?.agentName).toBe('technical');
    expect(mocks.mockDecisionFuse).toHaveBeenCalledTimes(1);
  });
});

// ── Decision (fusion) failure handling ─────────────────────────────────────

describe('runMultiAgentChat — decision failure handling', () => {
  it('fails strict Full mode when the Decision agent errors', async () => {
    mocks.mockDecisionFuse.mockRejectedValue(new Error('fusion crashed'));

    const err = await runMultiAgentChat(makeArgs({ analysisMode: 'full' })).catch((e) => e);

    expect(err).toBeInstanceOf(MultiAgentStrictFailureError);
    expect(err.stage).toBe('decision');
    expect(mocks.mockAppendAssistantMessage).not.toHaveBeenCalled();
    expect(mocks.mockReleaseBudgetReservation).toHaveBeenCalledWith('res-1');
  });

  it('falls back to specialist opinions in Standard mode when fusion fails', async () => {
    mocks.mockDecisionFuse.mockRejectedValue(new Error('fusion crashed'));

    const result = await runMultiAgentChat(makeArgs({ analysisMode: 'standard' }));

    expect(result.finalText).toContain('Technical Agent');
    expect(result.finalText).toContain('Fundamental Agent');
    expect(result.finalText).toContain('encountered an error');
    expect(mocks.mockAppendAssistantMessage).toHaveBeenCalledTimes(1);
    expect(mocks.mockReconcileBudgetReservation).toHaveBeenCalled();
  });
});

// ── Citation enforcement ───────────────────────────────────────────────────

describe('runMultiAgentChat — citation enforcement', () => {
  it('appends a citation warning part when enforcement flags unsupported claims', async () => {
    mocks.mockEnforceCitations.mockReturnValue({
      type: 'data-citation-warning',
      unsupportedClaims: ['XAUUSD is at 2400'],
      toolsInvoked: [],
      stance: 'warning',
      createdAt: Date.now(),
    });

    await runMultiAgentChat(makeArgs({ analysisMode: 'quick' }));

    const assistantCall = mocks.mockAppendAssistantMessage.mock.calls[0];
    const parts = assistantCall?.[2]?.parts as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'data-citation-warning')).toBe(true);
  });

  it('persists without warning when citation enforcement itself throws', async () => {
    mocks.mockEnforceCitations.mockImplementation(() => {
      throw new Error('citation boom');
    });

    const result = await runMultiAgentChat(makeArgs({ analysisMode: 'quick' }));

    expect(result.finalText).toBe('Fused response.');
    const assistantCall = mocks.mockAppendAssistantMessage.mock.calls[0];
    const parts = assistantCall?.[2]?.parts as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'data-citation-warning')).toBe(false);
  });
});

// ── Opinion persistence resilience ─────────────────────────────────────────

describe('runMultiAgentChat — opinion persistence resilience', () => {
  it('does not fail the turn when opinion persistence fails', async () => {
    mocks.mockSaveAgentOpinions.mockRejectedValue(new Error('opinions save failed'));

    const result = await runMultiAgentChat(makeArgs({ analysisMode: 'full' }));

    expect(result.finalText).toBe('Fused response.');
    expect(result.agentOpinions).toHaveLength(4);
  });
});
