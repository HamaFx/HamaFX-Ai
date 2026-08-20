import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMultiAgentAnalysis } from '../src/jobs/multi-agent-analysis';

const {
  mockClaimNextPendingJob,
  mockRunMastraMode,
  mockReserveTurnBudget,
  mockAppendUserMessage,
  mockAppendAssistantMessage,
} = vi.hoisted(() => ({
  mockClaimNextPendingJob: vi.fn(),
  mockRunMastraMode: vi.fn(),
  mockReserveTurnBudget: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockAppendAssistantMessage: vi.fn(),
}));

const updatePayloads: Array<Record<string, unknown>> = [];
let selectResultIndex = 0;

const settingsRow = {
  userId: 'user-1',
  defaultSymbol: 'XAUUSD',
  timezone: 'UTC',
  language: 'en',
  customInstructions: null,
  aiApiKeys: null,
  chatModel: null,
  maxDailyUsd: 5,
};

const job = {
  id: 'job-1',
  userId: 'user-1',
  threadId: 'thread-1',
  userMessageText: 'Analyze XAUUSD technically',
  userMessageParts: [{ type: 'text', text: 'Analyze XAUUSD technically' }],
  historyParts: [],
  mode: 'full',
  status: 'running',
  workerRunId: 'worker-run-1',
  traceId: 'trace-worker-1',
  attemptCount: 1,
  startedAt: new Date('2026-08-15T12:00:00.000Z'),
};

function thenableBuilder<T extends Record<string, unknown> = Record<string, unknown>>() {
  const builder: Record<string, unknown> & { then?: unknown } = {};
  builder.set = (payload: Record<string, unknown>) => {
    updatePayloads.push(payload);
    return builder;
  };
  builder.where = () => builder;
  builder.returning = () => Promise.resolve([{ id: 'job-1' }]);
  builder.then = (resolve: (value: undefined) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(undefined).then(resolve, reject);
  return builder as T & PromiseLike<undefined>;
}

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => {
        selectResultIndex++;
        return Promise.resolve([settingsRow]);
      },
    }),
  }),
  update: () => thenableBuilder(),
  delete: () => thenableBuilder(),
};

vi.mock('@kestrel/db', () => ({
  claimNextPendingJob: mockClaimNextPendingJob,
  recoverStaleJobs: vi.fn().mockResolvedValue({ requeued: 0, failed: 0 }),
  schema: {
    analysisJobs: {
      id: 'analysisJobs.id',
      status: 'analysisJobs.status',
      workerRunId: 'analysisJobs.workerRunId',
      updatedAt: 'analysisJobs.updatedAt',
      completedAt: 'analysisJobs.completedAt',
    },
    userSettings: { userId: 'userSettings.userId' },
  },
}));

vi.mock('@kestrel/ai/mastra', () => ({
  extractSymbolFromPrompt: vi.fn(() => 'XAUUSD'),
  isSafeSymbolResearchPrompt: vi.fn(() => true),
  runMastraMode: mockRunMastraMode,
}));

vi.mock('@kestrel/ai', () => ({
  getDb: () => mockDb,
  appendUserMessage: mockAppendUserMessage,
  appendAssistantMessage: mockAppendAssistantMessage,
  DEFAULT_MAX_DAILY_USD: 5,
  reserveTurnBudget: mockReserveTurnBudget,
  withDiagnostics: async (_userId: string, _threadId: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@kestrel/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/shared')>();
  return { ...actual, pickAiEnv: (env: unknown) => env };
});

vi.mock('@kestrel/shared/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kestrel/shared/logger')>();
  return {
    ...actual,
    traceIdStorage: { run: async (_traceId: string, fn: () => Promise<unknown>) => fn() },
  };
});

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
}));

describe('runMultiAgentAnalysis Mastra durable boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePayloads.length = 0;
    selectResultIndex = 0;
    mockClaimNextPendingJob.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    mockReserveTurnBudget.mockResolvedValue({
      reconcile: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
    });
    mockAppendUserMessage.mockResolvedValue({ messageId: 'user-message-1' });
    mockAppendAssistantMessage.mockResolvedValue({ messageId: 'assistant-message-1' });
    mockRunMastraMode.mockResolvedValue({
      finalText: 'Full Mastra analysis result',
      agentOpinions: [{ agentName: 'technical', bias: 'bullish' }],
      mode: 'full',
      symbol: 'XAUUSD',
      packet: { packetId: 'packet-1', dataQuality: 'complete' },
      totalCostUsd: 0.04,
      totalLatencyMs: 321,
    });
  });

  function context() {
    return {
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), with: vi.fn() },
      signal: new AbortController().signal,
      tenantRouter: { owns: () => true } as never,
    };
  }

  it('claims a job and executes only the Mastra Full workflow', async () => {
    const ctx = context();
    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockRunMastraMode).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        userId: 'user-1',
        runId: 'worker-run-1',
        mode: 'full',
        symbol: 'XAUUSD',
        telemetryKind: 'mastra_full_job',
      }),
    );
    expect(mockAppendUserMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ role: 'user' }),
      { idempotencyKey: 'analysis-job:job-1:user' },
    );
    expect(updatePayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'complete',
          result: expect.objectContaining({ finalText: 'Full Mastra analysis result' }),
        }),
      ]),
    );
  });

  it('requeues a retryable Mastra provider timeout', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('upstream timeout'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(updatePayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'pending',
          error: expect.stringContaining('retrying automatically'),
        }),
      ]),
    );
  });

  it('commits a terminal failure without a partial result for non-retryable errors', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('invalid structured output'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(updatePayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'failed',
          error: 'Full Mastra analysis could not be completed. No partial answer was returned.',
        }),
      ]),
    );
    expect(updatePayloads.some((payload) => 'result' in payload)).toBe(false);
  });
});
