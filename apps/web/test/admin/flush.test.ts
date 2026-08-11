// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  withAdminAuth: (handler: (req: Request) => Promise<Response>) =>
    async (req: Request) => handler(req),
}));

import { POST } from '@/app/api/admin/flush/route';

describe('POST /api/admin/flush', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('does not delete cron history for the cron_locks target', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/flush', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'cron_locks' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        target: 'cron_locks',
        status: 'unsupported',
        reason: 'Cron locks are not stored separately; cron history was left unchanged',
      },
    ]);
  });
});
