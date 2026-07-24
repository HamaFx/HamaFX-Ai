// SPDX-License-Identifier: Apache-2.0

import { getDiagnosticTrace } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/services/admin';
import type { DiagnosticTraceDetail, DiagnosticTraceError, DiagnosticTraceStep } from '@/lib/services/admin-dtos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth<{ id: string }>(async (_req, { user, params }) => {
  const { id } = await params;

  const row = await getDiagnosticTrace(id);

  if (!row) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'Trace not found' } }, { status: 404 });
  }

  const traceData = (row.trace ?? {}) as { steps?: unknown; errors?: unknown };

  await recordAdminAudit(user.userId, 'diagnostic.trace.view', row.userId ?? undefined, {
    traceId: id,
  });

  const trace: DiagnosticTraceDetail = {
    id: row.id,
    threadId: row.threadId ?? '',
    userId: row.userId ?? '',
    startedAt: row.startedAt.toISOString(),
    stepCount: row.stepCount,
    errorCount: row.errorCount,
    status: row.status as 'completed' | 'failed',
    durationMs: row.durationMs ?? null,
    summary: row.summary,
    metadata: (row.metadata ?? null) as DiagnosticTraceDetail['metadata'],
    steps: Array.isArray(traceData.steps) ? (traceData.steps as DiagnosticTraceStep[]) : [],
    errors: Array.isArray(traceData.errors) ? (traceData.errors as DiagnosticTraceError[]) : [],
  };

  return Response.json({ trace });
});
