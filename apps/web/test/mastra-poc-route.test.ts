import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runMastraXauusdResearch: vi.fn(),
  withRateLimit: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  errorResponse: vi.fn((error: unknown) => Response.json({ error: { code: 'TEST_ERROR', message: String(error) } }, { status: 500 })),
  parseJsonBody: async (req: Request, schema: { parse: (value: unknown) => unknown }) => schema.parse(await req.json()),
  withAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    (req: Request) => handler(req, { user: { userId: 'user-1' } }),
}));
vi.mock('@/lib/services/api-boundary', () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/services/mastra-xauusd', () => ({
  runMastraXauusdResearch: mocks.runMastraXauusdResearch,
}));

import { POST } from '@/app/api/dev/mastra/xauusd/route';

const THREAD_ID = '550e8400-e29b-41d4-a716-446655440000';

function request(body: unknown): Request {
  return new Request('http://localhost/api/dev/mastra/xauusd', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/dev/mastra/xauusd', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_MASTRA_POC = 'true';
    mocks.withRateLimit.mockReset().mockResolvedValue({ allowed: true, count: 1, limit: 5 });
    mocks.runMastraXauusdResearch.mockReset().mockResolvedValue({
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      stats: { inputTokens: 10, outputTokens: 20, toolCalls: 3, steps: 4 },
      packet: {
        packetId: 'packet-1',
        status: 'ready',
        dataQuality: 'partial',
      },
      report: { symbol: 'XAUUSD', bias: 'neutral' },
      result: { text: 'Evidence-aware result' },
    });
  });

  it('returns 404 unless the explicit development flag is enabled', async () => {
    process.env.ENABLE_MASTRA_POC = 'false';

    const response = await POST(request({ threadId: THREAD_ID, prompt: 'Analyse gold' }));

    expect(response.status).toBe(404);
    expect(mocks.runMastraXauusdResearch).not.toHaveBeenCalled();
  });

  it('validates the thread and prompt before running the agent', async () => {
    const response = await POST(request({ threadId: 'not-a-uuid', prompt: '' }));

    expect(response.status).toBe(500);
    expect(mocks.withRateLimit).not.toHaveBeenCalled();
    expect(mocks.runMastraXauusdResearch).not.toHaveBeenCalled();
  });

  it('runs the authenticated user’s BYOK research and returns only safe result fields', async () => {
    const response = await POST(request({ threadId: THREAD_ID, prompt: 'Analyse gold' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.withRateLimit).toHaveBeenCalledWith('user-1', 'mastra_xauusd_poc', 5);
    expect(mocks.runMastraXauusdResearch).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      threadId: THREAD_ID,
      prompt: 'Analyse gold',
      runId: expect.any(String),
      signal: expect.any(AbortSignal),
    }));
    expect(body).toMatchObject({
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      stats: { toolCalls: 3 },
      text: 'Evidence-aware result',
    });
    expect(body.result).toBeUndefined();
  });

  it('stops before the model call when the user is rate limited', async () => {
    mocks.withRateLimit.mockResolvedValue({ allowed: false, count: 6, limit: 5 });

    const response = await POST(request({ threadId: THREAD_ID, prompt: 'Analyse gold' }));

    expect(response.status).toBe(429);
    expect(mocks.runMastraXauusdResearch).not.toHaveBeenCalled();
  });
});
