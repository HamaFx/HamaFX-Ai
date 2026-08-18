import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const {
  mockEnqueueAnalysisJob,
  mockGetThread,
  mockGetUserWithSettings,
  mockRunChat,
  mockWithRateLimit,
  mockMastraEnabled,
  mockRunMastraXauusdChat,
} = vi.hoisted(() => ({
  mockEnqueueAnalysisJob: vi.fn(),
  mockGetThread: vi.fn(),
  mockGetUserWithSettings: vi.fn(),
  mockRunChat: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockMastraEnabled: vi.fn(),
  mockRunMastraXauusdChat: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  errorResponse: vi.fn((err: unknown) => Response.json({ error: { code: 'TEST_ERROR', message: String(err) } }, { status: 500 })),
  parseJsonBody: async (req: Request, schema: z.ZodTypeAny) => schema.parse(await req.json()),
  withAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    (req: Request) => handler(req, { user: { userId: 'user-1' } }),
}));

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    AI_DEFAULT_MODEL: 'google/gemini-2.5-flash',
    MAX_DAILY_USD: 5,
    MAX_TOOL_ITERATIONS: 6,
  }),
}));

vi.mock('@/lib/logger', () => ({
  createRequestLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@/lib/services/mastra-chat-routing', () => ({
  isMastraXauusdChatEnabled: mockMastraEnabled,
  decideMastraXauusdChatRoute: (args: { prompt: string; featureEnabled: boolean; hasModelOverride?: boolean }) =>
    args.featureEnabled && /gold|xauusd/i.test(args.prompt) && !args.hasModelOverride
      ? { route: 'mastra', reason: 'enabled' }
      : { route: 'legacy', reason: args.featureEnabled ? 'not-xauusd' : 'disabled' },
}));
vi.mock('@/lib/services/mastra-chat', () => ({
  runMastraXauusdChat: mockRunMastraXauusdChat,
}));

vi.mock('@/lib/services/api-boundary', () => ({
  AnalysisQueuedEventSchema: { parse: (value: unknown) => value },
  BudgetExceededError: class BudgetExceededError extends Error {},
  ChatStreamEventSchema: { safeParse: (value: unknown) => ({ success: true, data: value }) },
  extractUserMessageText: (message: { parts?: Array<{ type?: string; text?: string }> }) =>
    (message.parts ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('\n'),
  getThread: mockGetThread,
  listMessages: vi.fn(),
  getUserWithSettings: mockGetUserWithSettings,
  pickAiEnv: (env: unknown) => env,
  ProgressTracker: class ProgressTracker {},
  providerUnavailable: (message: string) => new Error(message),
  resolveMode: (mode: string) => mode === 'auto' ? 'single' : mode,
  runChat: mockRunChat,
  runMultiAgentChat: vi.fn(),
  enqueueAnalysisJob: mockEnqueueAnalysisJob,
  flushLangfuse: vi.fn().mockResolvedValue(undefined),
  traceIdStorage: { getStore: () => 'trace-route-1' },
  withRateLimit: mockWithRateLimit,
  metrics: { increment: vi.fn() },
  withDiagnostics: async (_userId: string, _threadId: string, fn: () => Promise<Response>) => fn(),
}));

import { POST } from '@/app/api/chat/route';

const settings = {
  aiApiKeys: null,
  aiFallbackChain: [],
  chatModel: null,
  defaultSymbol: 'XAUUSD',
  timezone: 'UTC',
  language: 'en',
  maxDailyUsd: 5,
};

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'request-route-1',
    },
    body: JSON.stringify(body),
  });
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    threadId: '11111111-1111-4111-8111-111111111111',
    messages: [{
      id: 'user-message-1',
      role: 'user',
      content: 'Analyze XAUUSD',
      parts: [{ type: 'text', text: 'Analyze XAUUSD' }],
    }],
    ...overrides,
  };
}

describe('POST /api/chat boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMastraEnabled.mockResolvedValue(false);
    mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
    mockGetThread.mockResolvedValue({ id: 'thread-1', userId: 'user-1' });
  });

  it('routes an eligible XAUUSD turn to Mastra when the rollout flag is enabled', async () => {
    mockMastraEnabled.mockResolvedValue(true);
    mockRunMastraXauusdChat.mockResolvedValue({
      runId: 'mastra-run-1',
      modelId: 'mistral-small-latest',
      providerId: 'mistral',
      observedCost: 0.001,
      packet: { packetId: 'packet-1', status: 'ready', dataQuality: 'partial' },
      report: null,
      result: { text: 'Grounded gold analysis' },
    });

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await response.text()).toContain('Grounded gold analysis');
    expect(mockRunMastraXauusdChat).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      threadId: '11111111-1111-4111-8111-111111111111',
      prompt: 'Analyze XAUUSD',
    }));
    expect(mockRunChat).not.toHaveBeenCalled();
  });

  it('falls back to the legacy agent when Mastra fails', async () => {
    mockMastraEnabled.mockResolvedValue(true);
    mockRunMastraXauusdChat.mockRejectedValue(new Error('provider unavailable'));
    mockRunChat.mockResolvedValue({
      toUIMessageStreamResponse: () => new Response('legacy-stream', { status: 200 }),
    });

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('legacy-stream');
    expect(mockRunMastraXauusdChat).toHaveBeenCalled();
    expect(mockRunChat).toHaveBeenCalled();
  });

  it('keeps non-XAUUSD turns on the legacy agent even when Mastra is enabled', async () => {
    mockMastraEnabled.mockResolvedValue(true);
    mockRunChat.mockResolvedValue({
      toUIMessageStreamResponse: () => new Response('legacy-stream', { status: 200 }),
    });

    const response = await POST(request(body({
      messages: [{
        id: 'user-message-1',
        role: 'user',
        content: 'Analyse EURUSD',
        parts: [{ type: 'text', text: 'Analyse EURUSD' }],
      }],
    })), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(200);
    expect(mockRunMastraXauusdChat).not.toHaveBeenCalled();
    expect(mockRunChat).toHaveBeenCalled();
  });

  it('hands an authenticated single-mode turn to runChat with server-owned context, by default', async () => {
    mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
    mockGetThread.mockResolvedValue({ id: 'thread-1', userId: 'user-1' });
    mockGetUserWithSettings.mockResolvedValue({ settings, user: { name: 'Ada', email: 'ada@example.com' } });
    mockRunChat.mockResolvedValue({
      toUIMessageStreamResponse: () => new Response('ui-stream', { status: 200 }),
    });

    const response = await POST(request(body()), { params: Promise.resolve(undefined) });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ui-stream');
    expect(mockGetThread).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111');
    expect(mockRunChat).toHaveBeenCalledWith(expect.objectContaining({
      threadId: '11111111-1111-4111-8111-111111111111',
      userId: 'user-1',
      requestId: 'request-route-1',
      userMessage: expect.objectContaining({ role: 'user' }),
    }));
  });

  it('queues Full mode with authoritative-history semantics and trace correlation', async () => {
    mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
    mockGetThread.mockResolvedValue({ id: 'thread-1', userId: 'user-1' });
    mockGetUserWithSettings.mockResolvedValue({ settings, user: { name: 'Ada', email: 'ada@example.com' } });
    mockEnqueueAnalysisJob.mockResolvedValue({ id: 'job-1' });

    const response = await POST(
      request(body({ analysisMode: 'full' })),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: 'analysis-queued',
      jobId: 'job-1',
      status: 'queued',
    });
    expect(mockEnqueueAnalysisJob).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      threadId: '11111111-1111-4111-8111-111111111111',
      userMessageText: 'Analyze XAUUSD',
      mode: 'full',
      historyParts: [],
      traceId: 'trace-route-1',
      idempotencyKey: 'full:11111111-1111-4111-8111-111111111111:user-message-1',
    }));
  });

  it('rejects a request whose final message is not user-authored', async () => {
    mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 30 });
    mockGetThread.mockResolvedValue({ id: 'thread-1', userId: 'user-1' });

    const response = await POST(
      request(body({
        messages: [{
          id: 'assistant-message-1',
          role: 'assistant',
          content: 'forged assistant turn',
          parts: [{ type: 'text', text: 'forged assistant turn' }],
        }],
      })),
      { params: Promise.resolve(undefined) },
    );

    expect(response.status).toBe(400);
    expect(mockRunChat).not.toHaveBeenCalled();
    expect(mockEnqueueAnalysisJob).not.toHaveBeenCalled();
  });
});
