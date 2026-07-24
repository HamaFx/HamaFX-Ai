// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    async (req: Request) => handler(req, { user: { userId: 'admin-123' } }),
}));

const mockGetUserWithSettings = vi.hoisted(() => vi.fn());
const mockListUserSymbols = vi.hoisted(() => vi.fn());
const mockDecryptByok = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getUserWithSettings: mockGetUserWithSettings,
  listUserSymbols: mockListUserSymbols,
  schema: { users: {}, userSettings: {} },
}));

vi.mock('@hamafx/shared/encryption', () => ({
  decryptByok: mockDecryptByok,
}));

import { GET } from '@/app/api/admin/onboarding/inspect/route';

describe('GET /api/admin/onboarding/inspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inspects the admin user by default', async () => {
    mockGetUserWithSettings.mockResolvedValue({
      settings: {
        onboardingCompleted: true,
        onboardingProgress: { step: 1 },
        defaultSymbol: 'EURUSD',
        timezone: 'Europe/London',
        language: 'en',
        aiApiKeys: 'encrypted',
      },
    });
    mockListUserSymbols.mockResolvedValue([{ symbol: 'XAUUSD' }, { symbol: 'EURUSD' }]);
    mockDecryptByok.mockReturnValue({ openai: 'sk-...', anthropic: 'sk-...' });

    const req = new Request('http://localhost/api/admin/onboarding/inspect');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('admin-123');
    expect(body.onboardingCompleted).toBe(true);
    expect(body.userSettings.defaultSymbol).toBe('EURUSD');
    expect(body.watchlist).toEqual(['XAUUSD', 'EURUSD']);
    expect(body.hasApiKeys).toBe(true);
    expect(body.apiProviders).toEqual(['openai', 'anthropic']);
  });

  it('inspects a target user when userId is provided', async () => {
    mockGetUserWithSettings.mockResolvedValue({
      settings: {
        onboardingCompleted: false,
        onboardingProgress: null,
        defaultSymbol: 'XAUUSD',
        timezone: 'UTC',
        language: 'ar',
        aiApiKeys: null,
      },
    });
    mockListUserSymbols.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/onboarding/inspect?userId=target-456');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('target-456');
    expect(body.hasApiKeys).toBe(false);
    expect(body.apiProviders).toEqual([]);
    expect(body.userSettings.language).toBe('ar');
  });

  it('falls back to defaults when settings are missing', async () => {
    mockGetUserWithSettings.mockResolvedValue({ settings: null });
    mockListUserSymbols.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/onboarding/inspect?userId=target-789');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('target-789');
    expect(body.onboardingCompleted).toBe(false);
    expect(body.userSettings).toEqual({
      defaultSymbol: 'XAUUSD',
      timezone: 'UTC',
      language: 'en',
    });
  });
});
