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

// U2 — GET /api/chat/analysis-jobs/[jobId]
//
// Polling endpoint for background multi-agent analysis jobs.

import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidJobId(id: string): boolean {
  return /^[a-f0-9-]{10,80}$/i.test(id);
}

export const GET = withAuth<{ jobId: string }>(async (req, ctx) => {
  const { jobId } = await ctx.params;
  if (!isValidJobId(jobId)) {
    return Response.json({ error: { code: 'VALIDATION', message: 'Invalid jobId' } }, { status: 400 });
  }

  const db = getDb();
  const [job] = await db
    .select({
      id: schema.analysisJobs.id,
      userId: schema.analysisJobs.userId,
      status: schema.analysisJobs.status,
      progress: schema.analysisJobs.progress,
      result: schema.analysisJobs.result,
      error: schema.analysisJobs.error,
      createdAt: schema.analysisJobs.createdAt,
      completedAt: schema.analysisJobs.completedAt,
    })
    .from(schema.analysisJobs)
    .where(eq(schema.analysisJobs.id, jobId))
    .limit(1);

  if (!job) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, { status: 404 });
  }

  // IDOR guard: only the owning user can poll their own jobs.
  if (job.userId !== ctx.user.userId) {
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Not your job' } }, { status: 403 });
  }

  return Response.json({
    id: job.id,
    status: job.status,
    progress: job.progress ?? [],
    result: job.result ?? null,
    error: job.error ?? null,
    createdAt: job.createdAt?.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  });
});
