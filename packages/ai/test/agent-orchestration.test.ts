/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 *
 * Characterization tests for the runChat orchestration in agent.ts.
 *
 * These lock the *glue* behaviour of runChatInner — ordering, budget
 * reserve/reconcile/release, retry/fallback, terminal-state guarding,
 * citation enforcement, planner wiring, message filtering, and error
 * propagation — with a scripted LLM client and mocked dependencies.
 * Individual stages (retry loop, planner, resolve-model, stream
 * callbacks, system prompt) have their own focused unit tests; this
 * suite covers the integration points between them.
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@kestrel/shared';
import { container } from '@kestrel/shared';

import { createScriptedLlmClient, scriptedModel } from './helpers/scripted-llm';
import { DB, LLM_CLIENT } from '../src/tokens';
import type { LlmClient } from '../src/llm-client';
import type { RunChatArgs } from '../src/types';

const mocks = vi.hoisted(() => ({
  mockAppendAssistantMessage: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockBuildLiveSnapshot: vi.fn(),
  mockCompactThread: vi.fn(),
  mockFlushLangfuse: vi.fn(),
  mockGetUserWithSettings: vi.fn(),
  mockListMessages: vi.fn(),
  mockPersistTrace: vi.fn(),
  mockRecordTelemetry: vi.fn(),
  mockResolveModelForTurn: vi.fn(),
  mockRunAutoTitleBackground: vi.fn(),
  mockReserveTurnBudget: vi.fn(),
  mockRouteTurn: vi.fn(),
  mockRunPlanner: vi.fn(),
  mockPickNextFallbackProvider: vi.fn(),
  mockDomainToolFilter: vi.fn(() => ({})),
}));

vi.mock('@kestrel/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@kestrel/db');
  return {
    ...actual,
    getUserWithSettings: mocks.mockGetUserWithSettings,
  };
});

vi.mock('../src/context', () => ({
  buildLiveSnapshot: mocks.mockBuildLiveSnapshot,
}));

vi.mock('../src/memory/thread-summary', () => ({
  compactThread: mocks.mockCompactThread,
}));

vi.mock('../src/persistence', () => ({
  appendAssistantMessage: mocks.mockAppendAssistantMessage,
  appendUserMessage: mocks.mockAppendUserMessage,
  listMessages: mocks.mockListMessages,
  recordTelemetry: mocks.mockRecordTelemetry,
}));

vi.mock('../src/chat/auto-title', () => ({
  runAutoTitleBackground: mocks.mockRunAutoTitleBackground,
}));

vi.mock('../src/chat/resolve-model', () => ({
  resolveModelForTurn: mocks.mockResolveModelForTurn,
}));

vi.mock('../src/budget-reservation', () => ({
  reserveTurnBudget: mocks.mockReserveTurnBudget,
}));

vi.mock('../src/instrumentation', () => ({
  flushLangfuse: mocks.mockFlushLangfuse,
}));

vi.mock('../src/diagnostics/trace-persistence', () => ({
  persistTrace: mocks.mockPersistTrace,
}));

vi.mock('../src/routing', () => ({
  routeTurn: mocks.mockRouteTurn,
}));

vi.mock('../src/planner', () => ({
  runPlanner: mocks.mockRunPlanner,
}));

vi.mock('../src/model-resolution', () => ({
  pickNextFallbackProvider: mocks.mockPickNextFallbackProvider,
}));

// Stub the domain tool menu so scripted tool-call scenarios never execute
// real market-data tools (which would hit the data layer / network).
vi.mock('../src/tools/by-domain', () => ({
  domainToolFilter: mocks.mockDomainToolFilter,
}));

import { runChat } from '../src/agent';

// ── Shared fixtures ─────────────────────────────────────────────────────────

const ENV = {
  AI_GATEWAY_API_KEY: '',
  GOOGLE_GENERATIVE_AI_API_KEY: 'scripted-key',
  GOOGLE_VERTEX_PROJECT: '',
  GOOGLE_VERTEX_LOCATION: '',
  GOOGLE_APPLICATION_CREDENTIALS_JSON: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  AI_DEFAULT_MODEL: 'google/gemini-2.5-flash',
  AI_TITLE_MODEL: '',
  AI_EMBEDDING_MODEL: '',
  MAX_DAILY_USD: 5,
  MAX_TOOL_ITERATIONS: 6,
  LOG_PROMPTS: false,
  AI_SEMANTIC_ROUTING_ENABLED: false,
  EXA_API_KEY: '',
  TAVILY_API_KEY: '',
  BRAVE_SEARCH_API_KEY: '',
  WEB_SEARCH_ENABLED: false,
  WEB_SEARCH_PROVIDER: 'auto' as const,
  WEB_SEARCH_FALLBACK_PROVIDERS: [],
  WEB_SEARCH_MAX_RESULTS: 5,
  WEB_SEARCH_MAX_CALLS_PER_TURN: 3,
  WEB_SEARCH_CACHE_TTL_SECONDS: 300,
  WEB_SEARCH_TIMEOUT_MS: 5000,
  USER_PLAN_TIER: 'pro',
} as never;

const userSettings = {
  aiApiKeys: null,
  aiFallbackChain: [],
  chatModel: null,
  defaultSymbol: 'XAUUSD',
  timezone: 'UTC',
  language: 'en',
  maxDailyUsd: 5,
} as never;

function makeUserMessage(text: string): UIMessage {
  return {
    id: 'user-message-1',
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function makeBudget(overrides?: Record<string, unknown>) {
  return {
    reservedUsd: 0.01,
    spent: 0.01,
    max: 5,
    released: false,
    reconcile: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makePlannerResult(overrides?: Record<string, unknown>) {
  return {
    plan: {
      type: 'data-plan',
      domain: 'technical',
      steps: ['Pull candles.'],
      expectedTools: ['get_candles'],
      rationale: 'Technical read.',
      modelId: 'google/gemini-2.5-flash',
      createdAt: Date.now(),
    },
    messageId: 'planner-message-1',
    inputTokens: 10,
    outputTokens: 5,
    ms: 12,
    source: 'llm',
    ...overrides,
  };
}

interface TurnOverrides {
  /** History returned by listMessages (before the user message is appended). */
  history?: Array<Record<string, unknown>>;
  /** Extra scripted scenarios for the LLM client. */
  scenarios?: Parameters<typeof createScriptedLlmClient>[0];
  /** Override the LLM client entirely (e.g. to fire onError). */
  client?: LlmClient;
  /** Override the resolved model result. */
  resolveModel?: unknown;
  /** Whether resolveModelForTurn throws on the given 1-based call index. */
  resolveModelThrowsOn?: number[];
  /** The error to throw from resolveModelForTurn. */
  resolveModelError?: Error;
  env?: Record<string, unknown>;
  runChatArgs?: Partial<RunChatArgs>;
}

async function setupTurn(overrides: TurnOverrides = {}) {
  const {
    history = [],
    scenarios = [{ type: 'text', text: 'The scripted response.', inputTokens: 17, outputTokens: 11 }],
    client,
    resolveModel,
    resolveModelThrowsOn = [],
    resolveModelError = new Error('rate limit exceeded'),
    env = {},
    runChatArgs = {},
  } = overrides;

  mocks.mockGetUserWithSettings.mockResolvedValue({
    settings: userSettings,
    user: { name: 'Ada', email: 'ada@example.com' },
  });
  mocks.mockBuildLiveSnapshot.mockResolvedValue({
    asOf: '2026-08-15T12:00:00.000Z',
    session: 'london',
    prices: {},
  });
  mocks.mockCompactThread.mockImplementation(async ({ history: h }: { history: unknown[] }) => ({
    extraSystem: null,
    kept: h,
    compacted: 0,
  }));
  mocks.mockRecordTelemetry.mockResolvedValue(undefined);
  mocks.mockPersistTrace.mockResolvedValue(undefined);
  mocks.mockFlushLangfuse.mockResolvedValue(undefined);
  mocks.mockRunAutoTitleBackground.mockResolvedValue(undefined);
  mocks.mockAppendAssistantMessage.mockResolvedValue({ messageId: 'assistant-message-1' });
  mocks.mockAppendUserMessage.mockImplementation(async (_userId: string, _threadId: string, message: UIMessage) => {
    history.push({
      id: message.id,
      threadId: 'thread-1',
      role: 'user',
      content: 'Explain the market context',
      parts: message.parts,
      createdAt: Date.now(),
    });
  });
  mocks.mockListMessages.mockImplementation(async () => history);
  mocks.mockRouteTurn.mockResolvedValue({
    domain: 'technical',
    planRequired: false,
    rationale: 'test rationale',
  });
  mocks.mockRunPlanner.mockResolvedValue(makePlannerResult());
  mocks.mockPickNextFallbackProvider.mockReturnValue({
    providerId: 'openai',
    modelId: 'gpt-4.1',
  });

  const budget = makeBudget();
  mocks.mockReserveTurnBudget.mockResolvedValue(budget);

  const defaultResolve = resolveModel ?? {
    resolvedModel: scriptedModel(),
    resolvedModelId: 'google/gemini-2.5-flash',
    providerId: 'google',
    nonEssentialDisabled: false,
  };
  mocks.mockResolveModelForTurn.mockImplementation(async () => {
    const callIndex = mocks.mockResolveModelForTurn.mock.calls.length;
    if (resolveModelThrowsOn.includes(callIndex)) throw resolveModelError;
    return defaultResolve;
  });

  // Always return a scripted wrapper so callers can inspect `calls`; for a
  // custom client the wrapper is inert (calls stays empty).
  const scripted = client
    ? ({ client, calls: [], remainingScenarios: () => 0 } as unknown as ReturnType<typeof createScriptedLlmClient>)
    : createScriptedLlmClient(scenarios);
  const llmClient = client ?? scripted.client;
  container.register(DB, () => ({ insert: vi.fn() } as never));
  container.register(LLM_CLIENT, () => llmClient);

  const args: RunChatArgs = {
    threadId: 'thread-1',
    userId: 'user-1',
    userMessage: makeUserMessage('Explain the market context'),
    env: { ...(ENV as Record<string, unknown>), ...env } as never,
    ...runChatArgs,
  };

  return { args, budget, scripted };
}

beforeEach(() => {
  vi.clearAllMocks();
  metrics.reset();
});

// ── Happy path ─────────────────────────────────────────────────────────────

describe('runChat orchestration — happy path', () => {
  it('runs the full turn: reserve → persist → history → route → stream → reconcile', async () => {
    const { args, budget, scripted } = await setupTurn();

    const result = await runChat(args);

    expect(await result.text).toBe('The scripted response.');
    expect(scripted.calls).toHaveLength(1);
    expect(scripted.calls[0]?.kind).toBe('streamText');

    // Ordering: user message persisted before streaming.
    expect(mocks.mockAppendUserMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ id: 'user-message-1', role: 'user' }),
    );
    expect(mocks.mockListMessages).toHaveBeenCalledWith('user-1', 'thread-1', 60);
    expect(mocks.mockBuildLiveSnapshot).toHaveBeenCalled();
    expect(mocks.mockCompactThread).toHaveBeenCalled();
    expect(mocks.mockRouteTurn).toHaveBeenCalled();

    // Assistant message persisted with the scripted text.
    expect(mocks.mockAppendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'text', text: 'The scripted response.' }],
      }),
    );

    // Final telemetry + routing breadcrumb.
    expect(mocks.mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'routing_technical',
    }));
    expect(mocks.mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      model: 'google/gemini-2.5-flash',
      inputTokens: 17,
      outputTokens: 11,
    }));

    // Budget reconciled once, never released on success.
    expect(budget.reconcile).toHaveBeenCalledTimes(1);
    expect(budget.release).not.toHaveBeenCalled();

    // Diagnostics completed + Langfuse flushed.
    expect(mocks.mockPersistTrace).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
    }));
    expect(mocks.mockFlushLangfuse).toHaveBeenCalled();

    // Success turn counted in metrics.
    expect(metrics.snapshot().counters['chat_turn_total{result=ok}']).toBe(1);
    // Phase D SLI — the request + stream-start latency are both emitted.
    expect(metrics.snapshot().counters['chat_request_total']).toBe(1);
    expect(metrics.snapshot().histograms['ttft_ms']?.count).toBe(1);
  });

  it('passes a model override through to model resolution', async () => {
    const { args } = await setupTurn({ runChatArgs: { modelOverride: 'openai:gpt-4.1' } });

    await runChat(args);

    expect(mocks.mockResolveModelForTurn).toHaveBeenCalledWith(
      expect.objectContaining({ currentModelOverride: 'openai:gpt-4.1' }),
    );
  });

  it('wires semantic routing when the env flag is enabled', async () => {
    const { args } = await setupTurn({ env: { AI_SEMANTIC_ROUTING_ENABLED: true } });

    await runChat(args);

    expect(mocks.mockRouteTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        semanticRouting: expect.objectContaining({ modelId: expect.any(String) }),
      }),
    );
  });

  it('runs the planner and records plan telemetry when planRequired', async () => {
    const { args } = await setupTurn();
    mocks.mockRouteTurn.mockResolvedValue({
      domain: 'technical',
      planRequired: true,
      rationale: 'needs a plan',
    });

    await runChat(args);

    expect(mocks.mockRunPlanner).toHaveBeenCalledWith(
      expect.objectContaining({ plannerModelId: expect.any(String) }),
    );
    expect(mocks.mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'plan_generated',
    }));
  });

  it('drops system-role and data-plan messages before streaming', async () => {
    const history = [
      {
        id: 'prev-assistant',
        threadId: 'thread-1',
        role: 'assistant',
        content: 'Previous answer',
        parts: [{ type: 'text', text: 'Previous answer' }],
        createdAt: Date.now() - 2000,
      },
      {
        id: 'system-note',
        threadId: 'thread-1',
        role: 'system',
        content: 'rolling summary',
        parts: [{ type: 'text', text: 'rolling summary' }],
        createdAt: Date.now() - 1000,
      },
      {
        id: 'plan-msg',
        threadId: 'thread-1',
        role: 'system',
        content: 'plan rationale',
        parts: [{ type: 'data-plan', domain: 'technical', steps: [], expectedTools: [], rationale: 'x', modelId: '', createdAt: 0 }],
        createdAt: Date.now() - 500,
      },
    ];
    const { args, scripted } = await setupTurn({ history });

    await runChat(args);

    const streamed = scripted.calls[0];
    expect(streamed?.kind).toBe('streamText');
    const messages = streamed?.options.messages as Array<{ role: string }>;
    const roles = messages?.map((m) => m.role) ?? [];
    expect(roles).toEqual(['assistant', 'user']);
    expect(roles).not.toContain('system');
  });

  it('appends a citation warning when the answer makes an unsupported price claim', async () => {
    const { args } = await setupTurn({
      scenarios: [{ type: 'text', text: 'XAUUSD is at 2400.25 and looks strong.', inputTokens: 5, outputTokens: 9 }],
    });

    await runChat(args);

    const call = mocks.mockAppendAssistantMessage.mock.calls[0];
    const parts = call?.[2]?.parts as Array<{ type: string }>;
    expect(parts?.some((p) => p.type === 'data-citation-warning')).toBe(true);
  });

  it('does not append a citation warning for a grounded claim', async () => {
    mocks.mockDomainToolFilter.mockReturnValue({
      get_price: { execute: async () => ({ price: 2400.25 }) },
    });
    const { args } = await setupTurn({
      scenarios: [{
        type: 'tool',
        toolName: 'get_price',
        input: { symbols: ['XAUUSD'] },
        text: 'XAUUSD is at 2400.25.',
        inputTokens: 5,
        outputTokens: 9,
      }],
    });

    await runChat(args);

    const call = mocks.mockAppendAssistantMessage.mock.calls[0];
    const parts = call?.[2]?.parts as Array<{ type: string }>;
    expect(parts?.some((p) => p.type === 'data-citation-warning')).toBe(false);
  });
});

// ── Error handling before streaming ────────────────────────────────────────

describe('runChat orchestration — pre-stream failures', () => {
  it('throws when user settings are missing and never reserves budget', async () => {
    const { args } = await setupTurn();
    mocks.mockGetUserWithSettings.mockResolvedValue({ settings: null, user: null });

    await expect(runChat(args)).rejects.toThrow('User settings not found');
    expect(mocks.mockReserveTurnBudget).not.toHaveBeenCalled();
    expect(mocks.mockAppendUserMessage).not.toHaveBeenCalled();
  });

  it('propagates a budget reservation failure before streaming', async () => {
    const err = new Error('Budget exceeded');
    const { args } = await setupTurn();
    mocks.mockReserveTurnBudget.mockRejectedValue(err);

    await expect(runChat(args)).rejects.toThrow('Budget exceeded');
    expect(mocks.mockAppendUserMessage).not.toHaveBeenCalled();
  });

  it('releases the reservation and marks diagnostics failed when routing throws', async () => {
    const err = new Error('routing exploded');
    const { args, budget } = await setupTurn();
    mocks.mockRouteTurn.mockRejectedValue(err);

    await expect(runChat(args)).rejects.toThrow('routing exploded');
    expect(budget.release).toHaveBeenCalledTimes(1);
    expect(mocks.mockPersistTrace).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
    }));
  });

  it('releases the reservation when history loading fails', async () => {
    const err = new Error('db down');
    const { args, budget } = await setupTurn();
    mocks.mockListMessages.mockRejectedValue(err);

    await expect(runChat(args)).rejects.toThrow('db down');
    expect(budget.release).toHaveBeenCalledTimes(1);
  });

  it('releases the reservation when the live snapshot fails', async () => {
    const err = new Error('snapshot failed');
    const { args, budget } = await setupTurn();
    mocks.mockBuildLiveSnapshot.mockRejectedValue(err);

    await expect(runChat(args)).rejects.toThrow('snapshot failed');
    expect(budget.release).toHaveBeenCalledTimes(1);
  });

  it('releases the reservation when compaction fails', async () => {
    const err = new Error('compaction failed');
    const { args, budget } = await setupTurn();
    mocks.mockCompactThread.mockRejectedValue(err);

    await expect(runChat(args)).rejects.toThrow('compaction failed');
    expect(budget.release).toHaveBeenCalledTimes(1);
  });
});

// ── Retry / fallback ───────────────────────────────────────────────────────

describe('runChat orchestration — retry and fallback', () => {
  it('falls back to another provider after a rate-limit and appends the fallback part', async () => {
    const { args, scripted } = await setupTurn({
      resolveModelThrowsOn: [1],
      resolveModelError: new Error('rate limit exceeded'),
    });

    const result = await runChat(args);

    expect(await result.text).toBe('The scripted response.');
    // Two attempts: first model resolution fails, second streams.
    expect(mocks.mockResolveModelForTurn).toHaveBeenCalledTimes(2);
    expect(scripted.calls).toHaveLength(1);

    // The fallback part is appended to the persisted assistant message.
    const call = mocks.mockAppendAssistantMessage.mock.calls[0];
    const parts = call?.[2]?.parts as Array<{ type: string; override?: string }>;
    const fallbackPart = parts?.find((p) => p.type === 'data-fallback');
    expect(fallbackPart).toBeDefined();
    // Model resolution itself failed, so no resolved model id is known —
    // the retry loop labels the fallback part 'auto' (documented behaviour).
    expect(fallbackPart?.override).toBe('auto');
  });

  it('releases the reservation when every attempt fails', async () => {
    const { args, budget } = await setupTurn({
      resolveModelThrowsOn: [1, 2, 3, 4, 5],
      resolveModelError: new Error('rate limit exceeded'),
    });

    await expect(runChat(args)).rejects.toThrow('rate limit exceeded');
    expect(mocks.mockResolveModelForTurn).toHaveBeenCalledTimes(5);
    // runChatWithFallback releases on exhaustion; the outer catch re-releases
    // (idempotent). At least one release must have happened.
    expect(budget.release).toHaveBeenCalled();
    expect(mocks.mockPersistTrace).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
    }));
  });
});

// ── Stream lifecycle callbacks ─────────────────────────────────────────────

describe('runChat orchestration — stream lifecycle', () => {
  function clientThatFiresOnError(): LlmClient {
    return {
      async generateText() {
        return { text: '', usage: { inputTokens: 0, outputTokens: 0 } };
      },
      async streamText(opts) {
        await opts.onError?.({ error: new Error('late stream failure') });
        return {
          toUIMessageStreamResponse: () => new Response(''),
          text: Promise.resolve(''),
        };
      },
    };
  }

  it('releases the reservation and records failure telemetry when the stream errors after handoff', async () => {
    const { args, budget } = await setupTurn({ client: clientThatFiresOnError() });

    const result = await runChat(args);
    await result.text;

    expect(budget.release).toHaveBeenCalledTimes(1);
    expect(mocks.mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'turn_failed',
    }));
    expect(mocks.mockPersistTrace).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
    }));
    expect(metrics.snapshot().counters['run_failed_total']).toBe(1);
  });

  it('never reconciles or persists a message when onFinish fires after onError (single terminal state)', async () => {
    const client: LlmClient = {
      async generateText() {
        return { text: '', usage: { inputTokens: 0, outputTokens: 0 } };
      },
      async streamText(opts) {
        await opts.onError?.({ error: new Error('late stream failure') });
        await opts.onFinish?.({
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop',
          response: { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'late' }] }] },
        });
        return {
          toUIMessageStreamResponse: () => new Response(''),
          text: Promise.resolve(''),
        };
      },
    };
    const { args, budget } = await setupTurn({ client });

    const result = await runChat(args);
    await result.text;

    // onError already released; onFinish must not reconcile or persist.
    expect(budget.release).toHaveBeenCalledTimes(1);
    expect(budget.reconcile).not.toHaveBeenCalled();
    expect(mocks.mockAppendAssistantMessage).not.toHaveBeenCalled();
    // The turn is counted as a failure. onFinish early-returns on the
    // terminal state, so the success/fail turn counter is intentionally
    // NOT emitted for this turn.
    expect(metrics.snapshot().counters['run_failed_total']).toBe(1);
    expect(metrics.snapshot().counters['chat_turn_total{result=fail}']).toBeUndefined();
  });
});
