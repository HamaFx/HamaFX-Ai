// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubscribe = vi.hoisted(() => vi.fn());
const mockUnsubscribe = vi.hoisted(() => vi.fn());
const mockIsEnabled = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request) => Promise<Response>) =>
    async (req: Request) => handler(req),
}));

vi.mock('@/lib/services/api-boundary', () => ({
  logStreamHub: {
    isEnabled: mockIsEnabled,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  },
}));

import { GET } from '@/app/api/admin/logs/stream/route';

describe('GET /api/admin/logs/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    mockIsEnabled.mockReturnValue(true);
  });

  it('returns a probe response without subscribing an SSE client', async () => {
    const response = await GET(new Request('http://localhost/api/admin/logs/stream?probe=1'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it('returns 503 before opening a stream when log streaming is disabled', async () => {
    mockIsEnabled.mockReturnValue(false);

    const response = await GET(new Request('http://localhost/api/admin/logs/stream?probe=1'), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(503);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });
});
