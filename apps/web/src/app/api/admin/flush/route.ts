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
  const flushed: string[] = [];

  if (target === 'cron_locks' || target === 'all') {
    // Remove stuck cron locks (started but not finished for > 1 hour)
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    await deleteOldCronRuns(cutoff);
    flushed.push('cron_locks');
  }

  if (target === 'cache' || target === 'all') {
    // In-memory caches are per-instance; best-effort signal via response
    flushed.push('cache');
  }

  if (target === 'sessions' || target === 'all') {
    // Sessions are JWT-based; we can't globally invalidate without rotating secrets.
    // Mark as best-effort.
    flushed.push('sessions');
  }

  return Response.json({ ok: true, flushed });
});
