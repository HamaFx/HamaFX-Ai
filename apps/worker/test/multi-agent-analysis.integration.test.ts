import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMultiAgentAnalysis } from '../src/jobs/multi-agent-analysis';

const {
  mockClaimNextFullAnalysisRun,
  mockCompleteFullAnalysisRun,
  mockFailFullAnalysisRun,
  mockRequeueFullAnalysisRun,
  mockTouchFullAnalysisRun,
  mockRecoverStaleRuns,
  mockPurgeOldRuns,
  mockRunMastraMode,
  mockReserveTurnBudget,
  mockAppendUserMessage,
  mockAppendAssistantMessage,
} = vi.hoisted(() => ({
  mockClaimNextFullAnalysisRun: vi.fn(),
  mockCompleteFullAnalysisRun: vi.fn(),
  mockFailFullAnalysisRun: vi.fn(),
  mockRequeueFullAnalysisRun: vi.fn(),
  mockTouchFullAnalysisRun: vi.fn(),
  mockRecoverStaleRuns: vi.fn(),
  mockPurgeOldRuns: vi.fn(),
  mockRunMastraMode: vi.fn(),
  mockReserveTurnBudget: vi.fn(),
  mockAppendUserMessage: vi.fn(),
  mockAppendAssistantMessage: vi.fn(),
}));

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

const payload = {
  kind: 'full-analysis' as const,
  version: 1,
  userId: 'user-1',
  threadId: 'thread-1',
  userMessageText: 'Analyze XAUUSD technically',
  userMessageParts: [{ type: 'text', text: 'Analyze XAUUSD technically' }],
  idempotencyKey: 'full:thread-1:message-1',
  traceId: 'trace-worker-1',
  attemptCount: 1,
  createdAt: '2026-08-15T12:00:00.000Z',
};

const claimed = { runId: 'run-1', payload };

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => Promise.resolve([settingsRow]),
    }),
  }),
};

vi.mock('@kestrel/db', () => ({
  schema: { userSettings: { userId: 'userSettings.userId' } },
}));

vi.mock('@kestrel/ai/mastra', () => ({
  claimNextFullAnalysisRun: mockClaimNextFullAnalysisRun,
  completeFullAnalysisRun: mockCompleteFullAnalysisRun,
  failFullAnalysisRun: mockFailFullAnalysisRun,
  requeueFullAnalysisRun: mockRequeueFullAnalysisRun,
  touchFullAnalysisRun: mockTouchFullAnalysisRun,
  recoverStaleFullAnalysisRuns: mockRecoverStaleRuns,
  purgeOldFullAnalysisRuns: mockPurgeOldRuns,
  FULL_ANALYSIS_WORKFLOW_ID: 'full-analysis',
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
  eq: vi.fn(),
}));

describe('runMultiAgentAnalysis Mastra durable boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaimNextFullAnalysisRun.mockResolvedValueOnce(claimed).mockResolvedValueOnce(null);
    mockRecoverStaleRuns.mockResolvedValue({ requeued: 0, failed: 0 });
    mockPurgeOldRuns.mockResolvedValue(0);
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

  it('claims a durable run and executes only the Mastra Full workflow', async () => {
    const ctx = context();
    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockClaimNextFullAnalysisRun).toHaveBeenCalled();
    expect(mockRunMastraMode).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        userId: 'user-1',
        runId: 'run-1',
        mode: 'full',
        symbol: 'XAUUSD',
        workflowId: 'full-analysis',
        telemetryKind: 'mastra_full_job',
      }),
    );
    expect(mockAppendUserMessage).toHaveBeenCalledWith(
      'user-1',
      'thread-1',
      expect.objectContaining({ role: 'user' }),
      { idempotencyKey: 'analysis-job:run-1:user' },
    );
    expect(mockCompleteFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ finalText: 'Full Mastra analysis result' }),
    );
    // The lease heartbeat interval is 30s — it never fires inside a fast test.
    expect(mockTouchFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('requeues a retryable Mastra provider timeout', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('upstream timeout'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockRequeueFullAnalysisRun).toHaveBeenCalledWith(
      'run-1',
      expect.stringContaining('retrying automatically'),
    );
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockFailFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('commits a terminal failure without a partial result for non-retryable errors', async () => {
    const ctx = context();
    mockRunMastraMode.mockRejectedValueOnce(new Error('invalid structured output'));

    const result = await runMultiAgentAnalysis(ctx);

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockFailFullAnalysisRun).toHaveBeenCalledWith('run-1', expect.any(Error));
    expect(mockCompleteFullAnalysisRun).not.toHaveBeenCalled();
    expect(mockRequeueFullAnalysisRun).not.toHaveBeenCalled();
  });

  it('runs stale recovery and retention purge after the queue poll', async () => {
    const ctx = context();
    await runMultiAgentAnalysis(ctx);

    expect(mockRecoverStaleRuns).toHaveBeenCalledWith(expect.any(Date), 3);
    expect(mockPurgeOldRuns).toHaveBeenCalledWith(expect.any(Date));
  });
});
