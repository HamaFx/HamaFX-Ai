import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createScriptedLlmClient } from '../helpers/scripted-llm';

const {
  mockAppendAssistantMessage,
  mockAppendUserMessage,
  mockBuildLiveSnapshot,
  mockCompactThread,
  mockFlushLangfuse,
  mockGetUserWithSettings,
  mockListMessages,
  mockPersistTrace,
  mockRecordTelemetry,
  mockResolveModelForTurn,
  mockRunAutoTitleBackground,
  mockReserveTurnBudget,
} = vi.hoisted(() => ({
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
}));

vi.mock('@kestrel/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@kestrel/db');
  return {
    ...actual,
    getUserWithSettings: mockGetUserWithSettings,
  };
});

vi.mock('../../src/context', () => ({
  buildLiveSnapshot: mockBuildLiveSnapshot,
}));

vi.mock('../../src/memory/thread-summary', () => ({
  compactThread: mockCompactThread,
}));

vi.mock('../../src/persistence', () => ({
  appendAssistantMessage: mockAppendAssistantMessage,
  appendUserMessage: mockAppendUserMessage,
  listMessages: mockListMessages,
  recordTelemetry: mockRecordTelemetry,
}));

vi.mock('../../src/chat/auto-title', () => ({
  runAutoTitleBackground: mockRunAutoTitleBackground,
}));

vi.mock('../../src/chat/resolve-model', () => ({
  resolveModelForTurn: mockResolveModelForTurn,
}));

vi.mock('../../src/budget-reservation', () => ({
  reserveTurnBudget: mockReserveTurnBudget,
}));

vi.mock('../../src/instrumentation', () => ({
  flushLangfuse: mockFlushLangfuse,
}));

vi.mock('../../src/diagnostics/trace-persistence', () => ({
  persistTrace: mockPersistTrace,
}));

import { runChat } from '../../src/agent';
import { DB, LLM_CLIENT } from '../../src/tokens';
import type { DbMessage } from '../../src/persistence';
import { container } from '@kestrel/shared';

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

describe('runChat scripted orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const transactionExecute = vi.fn()
      .mockResolvedValueOnce([{ total_usd_cents: 1 }])
      .mockResolvedValue([]);
    const mockDb = {
      transaction: async (callback: (tx: { execute: typeof transactionExecute }) => Promise<unknown>) =>
        callback({ execute: transactionExecute }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    };
    container.register(DB, () => mockDb as never);
    mockGetUserWithSettings.mockResolvedValue({
      settings: userSettings,
      user: { name: 'Ada', email: 'ada@example.com' },
    });
    mockBuildLiveSnapshot.mockResolvedValue({
      asOf: '2026-08-15T12:00:00.000Z',
      session: 'london',
      prices: {},
    });
    mockCompactThread.mockImplementation(async ({ history }: { history: unknown[] }) => ({
      extraSystem: null,
      kept: history,
      compacted: 0,
    }));
    mockRecordTelemetry.mockResolvedValue(undefined);
    mockPersistTrace.mockResolvedValue(undefined);
    mockFlushLangfuse.mockResolvedValue(undefined);
    mockRunAutoTitleBackground.mockResolvedValue(undefined);
    mockAppendAssistantMessage.mockResolvedValue({ messageId: 'assistant-message-1' });
    mockReserveTurnBudget.mockResolvedValue({
      reservedUsd: 0.01,
      spent: 0.01,
      max: 5,
      released: false,
      reconcile: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    });
    mockResolveModelForTurn.mockImplementation(async () => ({
      resolvedModel: { modelId: 'scripted-model' },
      resolvedModelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      nonEssentialDisabled: false,
    }));
  });

  it('persists the turn, invokes the scripted model, records telemetry, and completes diagnostics', async () => {
    const history: DbMessage[] = [
      {
        id: 'previous-assistant',
        threadId: 'thread-1',
        role: 'assistant' as const,
        content: 'Previous market context',
        parts: [{ type: 'text', text: 'Previous market context' }],
        createdAt: Date.now() - 1000,
      },
    ];
    mockAppendUserMessage.mockImplementation(async (_userId: string, _threadId: string, message: UIMessage) => {
      history.push({
        id: message.id,
        threadId: 'thread-1',
        role: 'user',
        content: 'Explain the market context',
        parts: message.parts,
        createdAt: Date.now(),
      });
    });
    mockListMessages.mockImplementation(async () => history);

    const scripted = createScriptedLlmClient([
      {
        type: 'text',
        text: 'The scripted response preserves the diagnostic contract.',
        inputTokens: 17,
        outputTokens: 11,
      },
    ]);
    container.register(LLM_CLIENT, () => scripted.client);

    const result = await runChat({
      threadId: 'thread-1',
      userId: 'user-1',
      userMessage: makeUserMessage('Explain the market context'),
      env: ENV,
      requestId: 'request-1',
    });

    expect(await result.text).toBe('The scripted response preserves the diagnostic contract.');
    expect(scripted.remainingScenarios()).toBe(0);
    expect(scripted.calls).toHaveLength(1);
    expect(scripted.calls[0]?.kind).toBe('streamText');
    expect(scripted.calls[0]?.options.messages).toHaveLength(2);
    expect(scripted.calls[0]?.options.system).toContain('LIVE_SNAPSHOT');

    expect(mockAppendUserMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ id: 'user-message-1', role: 'user' }),
    );
    expect(mockAppendAssistantMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({
        role: 'assistant',
        parts: [{ type: 'text', text: 'The scripted response preserves the diagnostic contract.' }],
      }),
    );
    expect(mockRecordTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      threadId: 'thread-1',
      model: 'google/gemini-2.5-flash',
      inputTokens: 17,
      outputTokens: 11,
    }));
    expect(mockPersistTrace).toHaveBeenCalledWith(expect.objectContaining({
      traceId: expect.any(String),
      userId: 'user-1',
      threadId: 'thread-1',
      status: 'completed',
    }));
    expect(mockFlushLangfuse).toHaveBeenCalled();
  });
});
