// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { listDiagnosticTraces } from '@hamafx/db';

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

  const traces = await listDiagnosticTraces({ threadId, limit });

  return Response.json({ traces });
});
