// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  consumeUIMessageStream: vi.fn(),
  waitUntil: vi.fn((promise: Promise<unknown>) => void promise),
  runMastraShadowComparison: vi.fn(),
}));

vi.mock('@kestrel/ai', () => ({
  consumeUIMessageStream: mocks.consumeUIMessageStream,
  waitUntil: mocks.waitUntil,
}));
vi.mock('@/lib/services/mastra-shadow-comparison', () => ({
  runMastraShadowComparison: mocks.runMastraShadowComparison,
}));

import { attachMastraShadowToResponse } from '@/lib/services/mastra-shadow-stream';

describe('Mastra shadow response wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the unchanged legacy body while scheduling a comparison', async () => {
    mocks.consumeUIMessageStream.mockResolvedValue({ text: 'legacy result' });
    mocks.runMastraShadowComparison.mockResolvedValue({ overlap: 'medium' });

    const response = attachMastraShadowToResponse(
      new Response('legacy-stream', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
      { userId: 'user-1', threadId: 'thread-1', prompt: 'Analyse XAUUSD' },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('legacy-stream');
    expect(mocks.waitUntil).toHaveBeenCalledOnce();

    await vi.waitFor(() => {
      expect(mocks.runMastraShadowComparison).toHaveBeenCalledWith({
        userId: 'user-1',
        threadId: 'thread-1',
        prompt: 'Analyse XAUUSD',
        legacyText: 'legacy result',
      });
    });
  });

  it('does not tee a response with no body', () => {
    const response = new Response(null, { status: 204 });
    expect(attachMastraShadowToResponse(response, {
      userId: 'user-1',
      threadId: 'thread-1',
      prompt: 'Analyse XAUUSD',
    })).toBe(response);
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });
});
