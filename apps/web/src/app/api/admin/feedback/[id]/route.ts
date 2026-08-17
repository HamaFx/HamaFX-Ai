// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody, errorResponse } from '@/lib/api';
import { recordAdminAudit } from '@/lib/services/admin';
import { reviewMessageFeedback } from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  status: z.enum(['unreviewed', 'in_review', 'reviewed', 'rejected']),
  label: z.enum(['pass', 'fail', 'needs_review']).optional(),
  issueCodes: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  reviewerNote: z.string().trim().max(4_000).optional(),
});

export const PATCH = withAdminAuth<{ id: string }>(async (req, { user, params }) => {
  const { id } = await params;
  try {
    const body = await parseJsonBody(req, bodySchema);
    const row = await reviewMessageFeedback({
      id,
      reviewerId: user.userId,
      status: body.status,
      ...(body.label ? { label: body.label } : {}),
      ...(body.issueCodes ? { issueCodes: body.issueCodes } : {}),
      ...(body.reviewerNote ? { reviewerNote: body.reviewerNote } : {}),
    });
    if (!row) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } }, { status: 404 });
    }
    await recordAdminAudit(user.userId, 'ai.feedback.review', row.userId, {
      feedbackId: row.id,
      status: row.reviewStatus,
      label: row.reviewerLabel,
      issueCodes: row.issueCodes,
    });
    return Response.json({ feedback: row });
  } catch (error) {
    return errorResponse(error, req);
  }
});
