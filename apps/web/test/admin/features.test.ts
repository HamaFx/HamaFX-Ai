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

const mockListFeatureFlags = vi.hoisted(() => vi.fn());
const mockUpsertFeatureFlag = vi.hoisted(() => vi.fn());

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
  listFeatureFlags: mockListFeatureFlags,
  upsertFeatureFlag: mockUpsertFeatureFlag,
  listUsersWithSettings: vi.fn(),
  countUsers: vi.fn(),
  schema: schemaProxy,
}));

import { GET as featuresGet, POST as featuresPost } from '@/app/api/admin/features/route';

describe('GET /api/admin/features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListFeatureFlags.mockResolvedValue([
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
    // The admin service calls upsertFeatureFlag for each toggle
    expect(mockUpsertFeatureFlag).toHaveBeenCalledTimes(2);
    expect(mockUpsertFeatureFlag).toHaveBeenCalledWith('newDashboard', true, 'admin-123');
    expect(mockUpsertFeatureFlag).toHaveBeenCalledWith('betaChat', false, 'admin-123');
  });
});
