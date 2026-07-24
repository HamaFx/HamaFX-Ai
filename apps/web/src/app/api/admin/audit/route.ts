// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { listAdminAuditLogs } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const GET = withAdminAuth(async (req) => {
  const { limit, offset } = parseSearchParams(req, querySchema);

  const rows = await listAdminAuditLogs(limit, offset);

  const entries = rows.map((row) => ({
    id: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    targetUserId: row.targetUserId ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  }));

  return Response.json({ entries });
});
