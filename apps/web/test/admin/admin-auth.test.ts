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

const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockWhere = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: mockSelect.mockReturnValue({
      from: mockFrom.mockReturnValue({
        where: mockWhere,
      }),
    }),
  }),
  schema: {
    users: {} as Record<string, unknown>,
  },
}));

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

import { getAdminUser, withAdminAuth } from '@/lib/admin-auth';

describe('getAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthenticated when no session exists', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('unauthenticated');
  });

  it('returns admin when user has admin role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-123' } });
    mockWhere.mockResolvedValue([{ id: 'u-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }]);

    const result = await getAdminUser();

    expect(result.admin).toEqual({ userId: 'u-123', email: 'admin@example.com', name: 'Admin' });
    expect(result.reason).toBe('authenticated');
  });

  it('returns forbidden when user is not admin and other admins exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-456' } });
    mockWhere
      .mockResolvedValueOnce([{ id: 'u-456', email: 'user@example.com', name: 'User', role: 'user' }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('forbidden');
  });

  it('treats single user as admin in single-user deployment', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-789' } });
    mockWhere
      .mockResolvedValueOnce([{ id: 'u-789', email: 'solo@example.com', name: 'Solo', role: 'user' }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const result = await getAdminUser();

    expect(result.admin).toEqual({ userId: 'u-789', email: 'solo@example.com', name: 'Solo' });
    expect(result.reason).toBe('authenticated');
  });

  it('returns forbidden when user record is missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-missing' } });
    mockWhere.mockResolvedValue([]);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('forbidden');
  });
});

describe('withAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const handler = withAdminAuth(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 when forbidden', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-456' } });
    mockWhere
      .mockResolvedValueOnce([{ id: 'u-456', email: 'user@example.com', name: 'User', role: 'user' }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const handler = withAdminAuth(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('calls the handler when admin is authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-123' } });
    mockWhere.mockResolvedValue([{ id: 'u-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }]);

    const handler = withAdminAuth(async (_req, { user }) => Response.json({ admin: user.userId }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe('u-123');
  });
});
