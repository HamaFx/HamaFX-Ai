// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { listDiagnosticTraces } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import type { DiagnosticTraceSummary } from '@/lib/services/admin-dtos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  threadId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAdminAuth(async (req) => {
  const { threadId, limit } = parseSearchParams(req, querySchema);

  const rows = await listDiagnosticTraces({ threadId, limit });

  const traces: DiagnosticTraceSummary[] = rows.map((row) => ({
    id: row.id,
    threadId: row.threadId ?? '',
    userId: row.userId ?? '',
    startedAt: row.startedAt.toISOString(),
    stepCount: row.stepCount,
    errorCount: row.errorCount,
  }));

  return Response.json({ traces });
});
