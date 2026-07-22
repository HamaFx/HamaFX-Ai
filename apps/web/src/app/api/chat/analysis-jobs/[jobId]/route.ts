// SPDX-License-Identifier: Apache-2.0

// U2 — GET /api/chat/analysis-jobs/[jobId]
//
// Polling endpoint for background multi-agent analysis jobs.

import { getAnalysisJob } from '@hamafx/db';
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

  const job = await getAnalysisJob(jobId);

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
