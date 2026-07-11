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

import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  threadId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAdminAuth(async (req) => {
  const { threadId, limit } = parseSearchParams(req, querySchema);

  const db = getDb();
  const traces = await db
    .select({
      id: schema.diagnosticTraces.id,
      userId: schema.diagnosticTraces.userId,
      threadId: schema.diagnosticTraces.threadId,
      startedAt: schema.diagnosticTraces.startedAt,
      durationMs: schema.diagnosticTraces.durationMs,
      stepCount: schema.diagnosticTraces.stepCount,
      errorCount: schema.diagnosticTraces.errorCount,
      status: schema.diagnosticTraces.status,
    })
    .from(schema.diagnosticTraces)
    .where(threadId ? eq(schema.diagnosticTraces.threadId, threadId) : undefined)
    .orderBy(desc(schema.diagnosticTraces.startedAt))
    .limit(limit);

  return Response.json({ traces });
});
