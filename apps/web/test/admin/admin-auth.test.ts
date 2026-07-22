// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock db ────────────────────────────────────────────────────────
// drizzle query builder pattern: select → from → where → orderBy → limit
// Each step returns a thenable (Promise-like) that also exposes chain
// methods so the caller can either `await` the result immediately or
// continue building the query.
//
// admin-auth.ts uses three query patterns:
//   1. select → from → where                        (user lookup)
//   2. select → from → where                        (admin count)
//   3. select → from → orderBy → limit               (first user)

const whereResults: unknown[] = [];
let whereCallIndex = 0;
let orderByLimitResult: unknown = [];

/**
 * Build a chainable drizzle mock — returned by from().
 * Has `.where()`, `.orderBy()`, `.limit()`, and `.then()` for await.
 */
function makeFromResult(): Record<string, unknown> {
  return {
    then: (resolve: (v: unknown) => void) => resolve([]),

    where: vi.fn(() => {
      const idx = whereCallIndex++;
      const value = whereResults[idx];
      return makeThenable(value ?? []);
    }),

    orderBy: vi.fn(() => ({
      limit: vi.fn(() => makeThenable(orderByLimitResult)),
    })),

    limit: vi.fn(() => makeFromResult()),
  };
}

function makeThenable(value: unknown): Record<string, unknown> {
  return {
    then: (resolve: (v: unknown) => void) => resolve(value),
  };
}

vi.mock('@hamafx/db', () => {
  const fromResult = makeFromResult();
  return {
    getDb: () => ({
      select: vi.fn(() => ({ from: vi.fn(() => fromResult) })),
    }),
    schema: {
      users: {} as Record<string, unknown>,
    },
  };
});

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

import { getAdminUser, withAdminAuth } from '@/lib/admin-auth';

function pushWhereResult(value: unknown) {
  whereResults.push(value);
}

function pushOrderByLimitResult(value: unknown) {
  orderByLimitResult = value;
}

function resetMockState() {
  whereResults.length = 0;
  whereCallIndex = 0;
  orderByLimitResult = [];
}

describe('getAdminUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  it('returns unauthenticated when no session exists', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('unauthenticated');
  });

  it('returns admin when user has admin role', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-123' } });
    pushWhereResult([{ id: 'u-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }]);

    const result = await getAdminUser();

    expect(result.admin).toEqual({ userId: 'u-123', email: 'admin@example.com', name: 'Admin' });
    expect(result.reason).toBe('authenticated');
  });

  it('returns forbidden when user is not admin and other admins exist', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-456' } });
    pushWhereResult([{ id: 'u-456', email: 'user@example.com', name: 'User', role: 'user' }]);
    pushWhereResult([{ count: 1 }]);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('forbidden');
  });

  it('treats single user as admin in single-user deployment', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-789' } });
    // Call 1: select → from → where (user lookup)
    pushWhereResult([{ id: 'u-789', email: 'solo@example.com', name: 'Solo', role: 'user' }]);
    // Call 2: select → from → where (admin count → 0)
    pushWhereResult([{ count: 0 }]);
    // Call 3: select → from → orderBy → limit (first user)
    pushOrderByLimitResult([{ id: 'u-789' }]);

    const result = await getAdminUser();

    expect(result.admin).toEqual({ userId: 'u-789', email: 'solo@example.com', name: 'Solo' });
    expect(result.reason).toBe('authenticated');
  });

  it('returns forbidden when user record is missing', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-missing' } });
    pushWhereResult([]);

    const result = await getAdminUser();

    expect(result.admin).toBeNull();
    expect(result.reason).toBe('forbidden');
  });
});

describe('withAdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
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
    pushWhereResult([{ id: 'u-456', email: 'user@example.com', name: 'User', role: 'user' }]);
    pushWhereResult([{ count: 1 }]);

    const handler = withAdminAuth(async () => Response.json({ ok: true }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('calls the handler when admin is authenticated', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-123' } });
    pushWhereResult([{ id: 'u-123', email: 'admin@example.com', name: 'Admin', role: 'admin' }]);

    const handler = withAdminAuth(async (_req, { user }) => Response.json({ admin: user.userId }));
    const res = await handler(new Request('http://localhost/api/admin/test'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe('u-123');
  });
});
