// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request, ctx: { user: { userId: string } }) => Promise<Response>) =>
    async (req: Request) => handler(req, { user: { userId: 'admin-123' } }),
}));

const mockGetUserById = vi.hoisted(() => vi.fn());
const mockResetOnboarding = vi.hoisted(() => vi.fn());
const mockRecordAdminAudit = vi.hoisted(() => vi.fn());

// Self-referencing proxy for transitive schema imports (e.g. @hamafx/data/health.ts).
const schemaProxy = vi.hoisted(() => {
  const p: Record<string, unknown> = {};
  return new Proxy(p, {
    get: (_target, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return schemaProxy;
    },
  });
});

vi.mock('@hamafx/db', () => ({
  getUserById: mockGetUserById,
  resetOnboarding: mockResetOnboarding,
  recordAdminAudit: mockRecordAdminAudit,
  schema: schemaProxy,
}));

import { POST as resetPost } from '@/app/api/admin/onboarding/reset/route';

describe('POST /api/admin/onboarding/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets onboarding for the admin user by default', async () => {
    mockGetUserById.mockResolvedValue({ id: 'admin-123' });

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
    expect(mockGetUserById).toHaveBeenCalledWith('admin-123');
    expect(mockResetOnboarding).toHaveBeenCalledWith('admin-123', 'soft');
  });

  it('resets onboarding for a target user when userId is provided', async () => {
    mockGetUserById.mockResolvedValue({ id: 'target-456' });

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ userId: 'target-456', mode: 'soft' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.userId).toBe('target-456');
    expect(mockGetUserById).toHaveBeenCalledWith('target-456');
    expect(mockResetOnboarding).toHaveBeenCalledWith('target-456', 'soft');
  });

  it('returns 404 when target user does not exist', async () => {
    mockGetUserById.mockResolvedValue(null);

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ userId: 'missing-user' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(mockResetOnboarding).not.toHaveBeenCalled();
  });

  it('performs a full reset by clearing symbols and resetting defaults', async () => {
    mockGetUserById.mockResolvedValue({ id: 'target-456' });

    const req = new Request('http://localhost/api/admin/onboarding/reset', {
      method: 'POST',
      body: JSON.stringify({ userId: 'target-456', mode: 'full' }),
    });

    const res = await resetPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('full');
    expect(mockResetOnboarding).toHaveBeenCalledWith('target-456', 'full');
  });
});
