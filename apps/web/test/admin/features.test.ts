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

const mockFrom = vi.hoisted(() => vi.fn());
const mockValues = vi.hoisted(() => vi.fn());
const mockOnConflictDoUpdate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({ from: mockFrom })),
    insert: vi.fn(() => ({ values: mockValues })),
    transaction: mockTransaction,
  }),
  schema: {
    featureFlags: { key: 'featureFlags.key' },
  },
}));

import { GET as featuresGet, POST as featuresPost } from '@/app/api/admin/features/route';

describe('GET /api/admin/features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockResolvedValue([
      { key: 'newDashboard', enabled: true },
      { key: 'betaChat', enabled: false },
    ]);
  });

  it('returns feature flags', async () => {
    const req = new Request('http://localhost/api/admin/features');
    const res = await featuresGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.features).toEqual({
      newDashboard: true,
      betaChat: false,
    });
  });
});

describe('POST /api/admin/features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    // The route runs inserts inside a transaction; provide tx.insert returning the same chain.
    mockTransaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        insert: () => ({ values: mockValues }),
      }),
    );
  });

  it('updates all feature flags in a transaction', async () => {
    const req = new Request('http://localhost/api/admin/features', {
      method: 'POST',
      body: JSON.stringify({ newDashboard: true, betaChat: false }),
    });

    const res = await featuresPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockValues).toHaveBeenCalledTimes(2);

    const calls = mockValues.mock.calls.map((call) => call[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        { key: 'newDashboard', enabled: true, updatedBy: 'admin-123' },
        { key: 'betaChat', enabled: false, updatedBy: 'admin-123' },
      ]),
    );

    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(2);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith({
      target: 'featureFlags.key',
      set: expect.objectContaining({ enabled: expect.any(Boolean), updatedAt: expect.any(Date), updatedBy: 'admin-123' }),
    });
  });
});
