// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import { listAiRegressionCases } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['open', 'resolved', 'dismissed']).optional(),
});

export const GET = withAdminAuth(async (req) => {
  const query = parseSearchParams(req, querySchema);
  const rows = await listAiRegressionCases(query);
  return Response.json({
    cases: rows.map((row) => ({
      id: row.id,
      feedbackId: row.feedbackId,
      threadId: row.threadId,
      messageId: row.messageId,
      promptSha256: row.promptSha256,
      assistantOutputSha256: row.assistantOutputSha256,
      issueCodes: row.issueCodes,
      reviewerNote: row.reviewerNote,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});
