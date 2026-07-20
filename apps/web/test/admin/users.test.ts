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

const mockListUsers = vi.hoisted(() => vi.fn());
const mockCountUsers = vi.hoisted(() => vi.fn());

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: vi.fn(),
  }),
  listUsersWithSettings: mockListUsers,
  countUsers: mockCountUsers,
  schema: { users: {}, userSettings: {} },
}));

import { GET as usersGet } from '@/app/api/admin/users/route';

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCountUsers.mockResolvedValue(42);
  });

  it('returns paginated user list with limit and offset', async () => {
    const users = [
      { id: 'u-1', email: 'a@example.com', name: 'A', role: 'user', createdAt: new Date().toISOString(), onboardingCompleted: true },
      { id: 'u-2', email: 'b@example.com', name: 'B', role: 'admin', createdAt: new Date().toISOString(), onboardingCompleted: false },
    ];
    mockListUsers.mockResolvedValue(users);

    const req = new Request('http://localhost/api/admin/users?limit=10&offset=5');
    const res = await usersGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual(users);
    expect(body.total).toBe(42);
  });

  it('uses default pagination when no query params are provided', async () => {
    mockListUsers.mockResolvedValue([]);

    const req = new Request('http://localhost/api/admin/users');
    const res = await usersGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual([]);
    expect(body.total).toBe(42);
  });
});
