import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockClaimNextPendingJob,
  mockRunMultiAgentChat,
  mockSelectAgents,
} = vi.hoisted(() => ({
  mockClaimNextPendingJob: vi.fn(),
  mockRunMultiAgentChat: vi.fn(),
  mockSelectAgents: vi.fn(),
}));

const updatePayloads: Array<Record<string, unknown>> = [];
const progressRows: Array<unknown> = [];
let selectResultIndex = 0;

const settingsRow = {
  userId: 'user-1',
  defaultSymbol: 'XAUUSD',
  timezone: 'UTC',
  language: 'en',
  customInstructions: null,
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
        const result = selectResultIndex++ === 0
          ? [settingsRow]
          : [{ name: 'Ada', email: 'ada@example.com' }];
        return Promise.resolve(result);
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
    users: { id: 'users.id', name: 'users.name', email: 'users.email' },
  },
}));

vi.mock('@kestrel/ai', () => ({
  getDb: () => mockDb,
  ProgressTracker: class ProgressTracker {
    private status = 'pending';
    constructor(private readonly mode: string, private readonly agents: string[]) {}
    update(event: { type?: string }) {
      if (event.type === 'analysis_error') this.status = 'failed';
      if (event.type === 'analysis_retry') this.status = 'retrying';
    }
    buildPart() {
      return {
        type: 'data-agent-progress',
        data: {
          mode: this.mode,
          status: this.status,
          agents: this.agents.map((agentName) => ({ agentName, status: 'done' })),
        },
      };
    }
  },
  selectAgents: mockSelectAgents,
  runMultiAgentChat: mockRunMultiAgentChat,
  extractUserMessageText: (message: { parts?: Array<{ type?: string; text?: string }> }) =>
    (message.parts ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n'),
  resolveMode: (mode: string) => mode,
  getThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
  listMessages: vi.fn().mockResolvedValue([
    { id: 'history-1', role: 'assistant', content: 'Prior context', parts: [{ type: 'text', text: 'Prior context' }] },
  ]),
  withDiagnostics: async (_userId: string, _threadId: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@kestrel/shared', () => ({
  pickAiEnv: (env: unknown) => env,
}));

vi.mock('@kestrel/shared/logger', () => ({
  traceIdStorage: { run: async (_traceId: string, fn: () => Promise<unknown>) => fn() },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  lt: vi.fn(),
}));

import { runMultiAgentAnalysis } from '../src/jobs/multi-agent-analysis';

describe('runMultiAgentAnalysis scripted boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePayloads.length = 0;
    progressRows.length = 0;
    selectResultIndex = 0;
    mockClaimNextPendingJob
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce(null);
    mockSelectAgents.mockReturnValue(['technical', 'fundamental', 'risk', 'sentiment']);
    mockRunMultiAgentChat.mockImplementation(async ({ onProgress }: { onProgress: (event: unknown) => void }) => {
      onProgress({
        type: 'specialists_start',
        agents: ['technical', 'fundamental', 'risk', 'sentiment'],
      });
      onProgress({ type: 'agent_done', agentName: 'technical' });
      return {
        finalText: 'Full analysis result',
        agentOpinions: [{ agentName: 'technical', bias: 'bullish' }],
        mode: 'full',
        totalCostUsd: 0.04,
        totalLatencyMs: 321,
        messageId: 'assistant-message-1',
      };
    });
  });

  it('claims a job, reconstructs authoritative context, persists progress, and commits the result', async () => {
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      with: vi.fn(),
    };

    const result = await runMultiAgentAnalysis({
      log,
      signal: new AbortController().signal,
      tenantRouter: { owns: () => true } as never,
    });

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(mockRunMultiAgentChat).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-1',
      userId: 'user-1',
      analysisMode: 'full',
      history: expect.arrayContaining([expect.objectContaining({ id: 'history-1' })]),
      userMessage: expect.objectContaining({ role: 'user' }),
    }));
    expect(updatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'complete', result: expect.objectContaining({ finalText: 'Full analysis result' }) }),
    ]));
    expect(updatePayloads.some((payload) => Array.isArray(payload.progress))).toBe(true);
    expect(log.info).toHaveBeenCalledWith('Analysis job completed', expect.objectContaining({
      jobId: 'job-1',
      workerRunId: 'worker-run-1',
    }));
  });

  it('requeues a retryable provider timeout instead of terminally failing the job', async () => {
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      with: vi.fn(),
    };
    mockRunMultiAgentChat.mockRejectedValueOnce(new Error('upstream timeout'));

    const result = await runMultiAgentAnalysis({
      log,
      signal: new AbortController().signal,
      tenantRouter: { owns: () => true } as never,
    });

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(updatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'pending', error: expect.stringContaining('retrying automatically') }),
    ]));
    expect(updatePayloads.some((payload) => payload.status === 'failed')).toBe(false);
  });

  it('commits a terminal failure and never stores a partial result for non-retryable errors', async () => {
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      with: vi.fn(),
    };
    mockRunMultiAgentChat.mockRejectedValueOnce(new Error('invalid committee output'));

    const result = await runMultiAgentAnalysis({
      log,
      signal: new AbortController().signal,
      tenantRouter: { owns: () => true } as never,
    });

    expect(result).toEqual({ processed: 1, note: 'processed=1' });
    expect(updatePayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'failed',
        error: 'Full analysis could not be completed. No partial answer was returned.',
      }),
    ]));
    expect(updatePayloads.some((payload) => 'result' in payload)).toBe(false);
  });
});
