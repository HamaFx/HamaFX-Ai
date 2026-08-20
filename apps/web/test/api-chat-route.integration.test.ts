import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { POST } from '@/app/api/chat/route';

const {
  mockEnqueueAnalysisJob,
  mockGetThread,
  mockWithRateLimit,
  mockRunMastraXauusdChat,
  mockRunMastraCanonicalChatService,
  mockRunMastraModeChat,
  mockMastraCanonicalResponse,
  mockMastraChatResponse,
  mockMastraModeResponse,
} = vi.hoisted(() => ({
  mockEnqueueAnalysisJob: vi.fn(),
  mockGetThread: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockRunMastraXauusdChat: vi.fn(),
  mockRunMastraCanonicalChatService: vi.fn(),
  mockRunMastraModeChat: vi.fn(),
  mockMastraCanonicalResponse: vi.fn(() => new Response('canonical', { status: 200 })),
  mockMastraChatResponse: vi.fn(() => new Response('xauusd', { status: 200 })),
  mockMastraModeResponse: vi.fn(() => new Response('mode', { status: 200 })),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/lib/api', () => ({
  errorResponse: vi.fn((error: unknown) =>
    Response.json({ error: { code: 'TEST_ERROR', message: String(error) } }, { status: 500 }),
  ),
  parseJsonBody: async (req: Request, schema: z.ZodTypeAny) => schema.parse(await req.json()),
  withAuth:
    (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { user: { userId: 'user-1' } }),
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    AI_DEFAULT_MODEL: 'google/gemini-3.6-flash',
    MAX_DAILY_USD: 5,
    MAX_TOOL_ITERATIONS: 6,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createRequestLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('@/lib/services/mastra-chat-routing', () => ({
  isMastraPromptUnsafe: (prompt: string) => /buy|sell|system:\s*ignore/i.test(prompt),
  extractMastraSymbol: (prompt: string) => {
    if (/xauusd|gold/i.test(prompt)) return 'XAUUSD';
    if (/eurusd/i.test(prompt)) return 'EURUSD';
    return null;
  },
  isMastraSymbolCandidate: () => true,
  isMastraXauusdCandidate: (prompt: string) => /xauusd|gold/i.test(prompt),
  isMastraXauusdFollowupCandidate: () => false,
  mastraXauusdChatKind: () => 'research',
}));

vi.mock('@/lib/services/mastra-chat', () => ({
  runMastraXauusdChat: mockRunMastraXauusdChat,
}));
vi.mock('@/lib/services/mastra-canonical-chat', () => ({
  runMastraCanonicalChatService: mockRunMastraCanonicalChatService,
}));
vi.mock('@/lib/services/mastra-mode', () => ({
  runMastraModeChat: mockRunMastraModeChat,
}));
vi.mock('@/lib/services/mastra-canonical-response', () => ({
  mastraCanonicalResponse: mockMastraCanonicalResponse,
}));
vi.mock('@/lib/services/mastra-chat-response', () => ({
  mastraChatResponse: mockMastraChatResponse,
}));
vi.mock('@/lib/services/mastra-mode-response', () => ({
  mastraModeResponse: mockMastraModeResponse,
}));
vi.mock('@/lib/services/mastra-report-context', () => ({
  extractLatestMastraReport: vi.fn(() => null),
  mayReferToMastraReport: vi.fn(() => false),
}));

vi.mock('@/lib/services/api-boundary', () => ({
  AnalysisQueuedEventSchema: { parse: (value: unknown) => value },
  BudgetExceededError: class BudgetExceededError extends Error {
    spent = 5;
    max = 5;
  },
  extractUserMessageText: (message: { parts?: Array<{ type?: string; text?: string }> }) =>
    (message.parts ?? [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n'),
  getThread: mockGetThread,
  listMessages: vi.fn().mockResolvedValue([]),
  resolveMode: (mode: string) => (mode === 'auto' ? 'single' : mode),
  enqueueAnalysisJob: mockEnqueueAnalysisJob,
  traceIdStorage: { getStore: () => 'trace-route-1' },
  withDiagnostics: async (_userId: string, _threadId: string, fn: () => Promise<Response>) => fn(),
  withRateLimit: mockWithRateLimit,
}));

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'request-route-1' },
    body: JSON.stringify(body),
  });
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    threadId: '11111111-1111-4111-8111-111111111111',
    messages: [
      {
        id: 'user-message-1',
        role: 'user',
        content: 'Analyze XAUUSD',
        parts: [{ type: 'text', text: 'Analyze XAUUSD' }],
      },
    ],
    ...overrides,
  };
}

describe('POST /api/chat Mastra boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
    mockGetThread.mockResolvedValue({ id: 'thread-1', userId: 'user-1' });
    mockEnqueueAnalysisJob.mockResolvedValue({ id: 'job-1' });
    mockRunMastraXauusdChat.mockResolvedValue({
      result: { text: 'xauusd result' },
      runId: 'run-1',
      modelId: 'google:gemini-3.6-flash',
      providerId: 'google',
      report: null,
      packet: { status: 'ready', dataQuality: 'complete', packetId: 'packet-1' },
      observedCost: 0.001,
    });
    mockRunMastraCanonicalChatService.mockResolvedValue({
      text: 'canonical result',
      runId: 'run-2',
      messageId: 'message-2',
    });
    mockRunMastraModeChat.mockResolvedValue({
      finalText: 'mode result',
      mode: 'standard',
      symbol: 'EURUSD',
      runId: 'run-3',
      packet: { packetId: 'packet-3', dataQuality: 'complete' },
      totalCostUsd: 0.001,
      totalLatencyMs: 10,
      agentOpinions: [],
    });
  });

  it('routes XAUUSD research directly to the specialized Mastra report path', async () => {
    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(200);
    expect(mockRunMastraXauusdChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        threadId: '11111111-1111-4111-8111-111111111111',
        modelOverride: null,
      }),
    );
    expect(mockRunMastraCanonicalChatService).not.toHaveBeenCalled();
  });

  it('routes symbol-free read-only conversation to canonical Mastra', async () => {
    const response = await POST(
      request(
        body({
          messages: [
            {
              id: 'user-message-2',
              role: 'user',
              content: 'Explain how RSI works',
              parts: [{ type: 'text', text: 'Explain how RSI works' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(200);
    expect(mockRunMastraCanonicalChatService).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', threadId: expect.any(String) }),
    );
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
  });

  it('routes Quick and Standard symbol analysis to the shared Mastra mode workflow', async () => {
    const response = await POST(
      request(
        body({
          analysisMode: 'standard',
          messages: [
            {
              id: 'user-message-3',
              role: 'user',
              content: 'Analyze EURUSD structure',
              parts: [{ type: 'text', text: 'Analyze EURUSD structure' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(200);
    expect(mockRunMastraModeChat).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'EURUSD', mode: 'standard' }),
    );
  });

  it('queues Full mode for the Mastra worker with authoritative-history semantics', async () => {
    const response = await POST(request(body({ analysisMode: 'full' })), {
      params: Promise.resolve(undefined),
    });

    expect(response.status).toBe(200);
    expect(mockEnqueueAnalysisJob).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'full',
        historyParts: [],
        traceId: 'trace-route-1',
      }),
    );
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
    expect(mockRunMastraModeChat).not.toHaveBeenCalled();
  });

  it('passes an explicit model override to the Mastra canonical agent', async () => {
    await POST(
      request(
        body({
          modelOverride: 'mistral:mistral-small-latest',
          messages: [
            {
              id: 'user-message-4',
              role: 'user',
              content: 'Explain RSI',
              parts: [{ type: 'text', text: 'Explain RSI' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(mockRunMastraCanonicalChatService).toHaveBeenCalledWith(
      expect.objectContaining({ modelOverride: 'mistral:mistral-small-latest' }),
    );
  });

  it('rejects mutation or injection-like prompts instead of falling back', async () => {
    const response = await POST(
      request(
        body({
          messages: [
            {
              id: 'user-message-5',
              role: 'user',
              content: 'Buy gold now',
              parts: [{ type: 'text', text: 'Buy gold now' }],
            },
          ],
        }),
      ),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'READ_ONLY_REQUEST_REQUIRED' },
    });
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
    expect(mockRunMastraCanonicalChatService).not.toHaveBeenCalled();
  });

  it('returns an explicit Mastra failure rather than invoking a legacy fallback', async () => {
    mockRunMastraXauusdChat.mockRejectedValue(new Error('provider unavailable'));

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'MASTRA_FAILED' } });
  });

  it('rejects Full mode model overrides until the durable job schema carries them', async () => {
    const response = await POST(
      request(body({ analysisMode: 'full', modelOverride: 'mistral:mistral-small-latest' })),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(400);
    expect(mockEnqueueAnalysisJob).not.toHaveBeenCalled();
  });
});
