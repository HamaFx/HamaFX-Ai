// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { deleteOldCronRuns } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const flushSchema = z.object({
  target: z.enum(['cache', 'sessions', 'cron_locks', 'all']),
});

export const POST = withAdminAuth(async (req) => {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Flush is dev-only' } }, { status: 403 });
  }

  const { target } = await parseJsonBody(req, flushSchema);
  const results: Array<{
    target: string;
    status: 'flushed' | 'unsupported';
    reason?: string;
    affected?: number;
  }> = [];

  if (target === 'cron_locks' || target === 'all') {
    // Remove stuck cron locks (started but not finished for > 1 hour)
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    await deleteOldCronRuns(cutoff);
    results.push({ target: 'cron_locks', status: 'flushed' });
  }

  if (target === 'cache' || target === 'all') {
    // In-memory caches are per-instance; there is no way to flush them
    // globally. Signal that this target is unsupported.
    results.push({
      target: 'cache',
      status: 'unsupported',
      reason: 'In-memory caches are per-instance and cannot be flushed remotely',
    });
  }

  if (target === 'sessions' || target === 'all') {
    // Sessions are JWT-based; we can't globally invalidate without rotating
    // secrets. Direct operators to the "sign out everywhere" / tokenVersion
    // bump path instead.
    results.push({
      target: 'sessions',
      status: 'unsupported',
      reason: 'JWT sessions are stateless; use tokenVersion bump or sign-out-everywhere',
    });
  }

  return Response.json({ results });
});
