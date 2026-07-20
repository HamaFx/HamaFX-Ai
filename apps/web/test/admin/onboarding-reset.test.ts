/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    async (req: Request) => handler(req, { user: { userId: 'admin-123' } }),
}));

const mockSelectWhere = vi.hoisted(() => vi.fn());
const mockUpdateSet = vi.hoisted(() => vi.fn());
const mockUpdateWhere = vi.hoisted(() => vi.fn());
const mockDeleteWhere = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: mockSelectWhere })) })),
    transaction: mockTransaction,
  }),
  getUserById: vi.fn(),
  resetOnboarding: vi.fn(),
  schema: {
    users: { id: 'users.id' },
    userSettings: { userId: 'userSettings.userId' },
    userSymbols: { userId: 'userSymbols.userId' },
  },
}));

import { POST as resetPost } from '@/app/api/admin/onboarding/reset/route';

describe('POST /api/admin/onboarding/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockTransaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        delete: () => ({ where: mockDeleteWhere }),
        update: () => ({ set: mockUpdateSet }),
      }),
    );
  });

  it('resets onboarding for the admin user by default', async () => {
    mockSelectWhere.mockResolvedValue([{ id: 'admin-123' }]);

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ mode: 'soft' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.userId).toBe('admin-123');
    expect(body.reset).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith({
      onboardingCompleted: false,
      onboardingProgress: null,
    });
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it('resets onboarding for a target user when userId is provided', async () => {
    mockSelectWhere.mockResolvedValue([{ id: 'target-456' }]);

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ userId: 'target-456', mode: 'soft' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('target-456');
  });

  it('returns 404 when target user does not exist', async () => {
    mockSelectWhere.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ userId: 'missing-user' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('performs a full reset by clearing symbols and resetting defaults', async () => {
    mockSelectWhere.mockResolvedValue([{ id: 'target-456' }]);

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ userId: 'target-456', mode: 'full' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('full');
    expect(mockUpdateSet).toHaveBeenCalledWith({
      onboardingCompleted: false,
      onboardingProgress: null,
      defaultSymbol: 'XAUUSD',
      timezone: 'UTC',
      aiApiKeys: null,
    });
    expect(mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
