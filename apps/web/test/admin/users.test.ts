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

const mockOffset = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: vi.fn(() => ({
      // The route issues two queries from the same `select().from()` entry:
      // 1. Count query: `await db.select(...).from(schema.users)` — awaited directly.
      // 2. User list query: `.from(...).leftJoin(...).orderBy(...).limit(...).offset(...)`.
      // We return a thenable that resolves to the count when awaited, while also
      // exposing the leftJoin chain for the paginated query.
      from: vi.fn((table: unknown) => {
        // The count query awaits the from-chain directly; resolve with the count.
        const thenable = Promise.resolve([{ count: 42 }]);
        return Object.assign(thenable, {
          leftJoin: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: mockOffset,
              }),
            }),
          }),
          where: vi.fn(),
        });
      }),
    })),
  }),
  schema: {
    users: {} as Record<string, unknown>,
    userSettings: {} as Record<string, unknown>,
  },
  listUsersWithSettings: vi.fn(async (limit: number, offset: number) => {
    return mockOffset(offset).then(() => []);
  }),
  countUsers: vi.fn(async () => 42),
}));

import { GET as usersGet } from '@/app/api/admin/users/route';

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOffset.mockReset();
  });

  it('returns paginated user list with limit and offset', async () => {
    const users = [
      { id: 'u-1', email: 'a@example.com', name: 'A', role: 'user', createdAt: new Date().toISOString(), onboardingCompleted: true },
      { id: 'u-2', email: 'b@example.com', name: 'B', role: 'admin', createdAt: new Date().toISOString(), onboardingCompleted: false },
    ];

    mockOffset.mockResolvedValue(users);

    const req = new Request('http://localhost/api/admin/users?limit=10&offset=5');
    const res = await usersGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual(users);
    expect(body.total).toBe(42);

    // Verify pagination params are parsed and passed through
    expect(mockOffset).toHaveBeenCalledWith(5);
  });

  it('uses default pagination when no query params are provided', async () => {
    mockOffset.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/users');
    const res = await usersGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(body.total).toBe(42);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });
});
