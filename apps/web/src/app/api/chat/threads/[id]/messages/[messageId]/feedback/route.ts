// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { withAuth, parseJsonBody, errorResponse } from '@/lib/api';
import {
  deleteMessageFeedback,
  getMessageFeedback,
  upsertMessageFeedback,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  rating: z.enum(['positive', 'negative']),
  userNote: z.string().trim().max(2_000).optional(),
  traceId: z.string().trim().max(200).optional(),
});

type Params = { id: string; messageId: string };

export const GET = withAuth<Params>(async (_req, { user, params }) => {
  const { id, messageId } = await params;
  const feedback = await getMessageFeedback(user.userId, id, messageId);
  return Response.json({ feedback: feedback ? toDto(feedback) : null });
});

export const PUT = withAuth<Params>(async (req, { user, params }) => {
  const { id, messageId } = await params;
  try {
    const body = await parseJsonBody(req, bodySchema);
    const feedback = await upsertMessageFeedback({
      userId: user.userId,
      threadId: id,
      messageId,
      rating: body.rating,
      ...(body.userNote ? { userNote: body.userNote } : {}),
      ...(body.traceId ? { traceId: body.traceId } : {}),
    });
    if (!feedback) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Message not found' } }, { status: 404 });
    }
    return Response.json({ feedback: toDto(feedback) });
  } catch (error) {
    return errorResponse(error, req);
  }
});

export const DELETE = withAuth<Params>(async (_req, { user, params }) => {
  const { id, messageId } = await params;
  const deleted = await deleteMessageFeedback(user.userId, id, messageId);
  return Response.json({ deleted });
});

function toDto(row: Awaited<ReturnType<typeof getMessageFeedback>> extends infer T
  ? Exclude<T, null>
  : never) {
  return {
    id: row.id,
    messageId: row.messageId,
    rating: row.rating,
    reviewStatus: row.reviewStatus,
    reviewerLabel: row.reviewerLabel,
    issueCodes: row.issueCodes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
