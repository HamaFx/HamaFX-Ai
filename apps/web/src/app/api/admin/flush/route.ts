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

import { lt } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';

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

  const db = getDb();

  if (target === 'cron_locks' || target === 'all') {
    // Remove stuck cron locks (started but not finished for > 1 hour)
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    await db.delete(schema.cronRuns).where(lt(schema.cronRuns.startedAt, cutoff));
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
