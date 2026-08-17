// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody, errorResponse } from '@/lib/api';
import { approveEvalDataset } from '@/lib/services/api-boundary';
import { recordAdminAudit } from '@/lib/services/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['draft', 'in_review', 'approved', 'archived']),
});

export const PATCH = withAdminAuth<{ version: string }>(async (req, { user, params }) => {
  const { version } = await params;
  try {
    const body = await parseJsonBody(req, bodySchema);
    const row = await approveEvalDataset({ version, reviewerId: user.userId, status: body.status });
    if (!row) {
      return Response.json({ error: { code: 'CONFLICT', message: 'Invalid dataset lifecycle transition or version not found' } }, { status: 409 });
    }
    await recordAdminAudit(user.userId, 'ai.dataset.status', undefined, { version, status: body.status });
    return Response.json({ dataset: row });
  } catch (error) {
    return errorResponse(error, req);
  }
});
