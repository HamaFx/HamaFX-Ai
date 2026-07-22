// SPDX-License-Identifier: Apache-2.0

// /api/chat/threads/bulk-delete — delete multiple threads at once.
//
// Phase A — UX_UPGRADE_PLAN.md item 5.
//
// Body: { ids: string[] } (1..50 ids).
//
// Scoped by userId in the WHERE clause so cross-user ids in the
// request are silently skipped — the deleted count reflects only
// rows that actually belonged to the caller. We return the count so
// the UI can show "deleted N conversations" instead of a generic
// success toast.

import { withRateLimit, batchDeleteThreads } from '@hamafx/db';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
});

// Bulk delete is a destructive batch action — rate-limit it more
// strictly than chat. 10 calls / minute / user covers a power user
// tapping "delete 50 selected" several times without locking out
// the legitimate flow.
const BULK_DELETE_RATE_LIMIT = Number(
  process.env.AI_BULK_DELETE_RATE_LIMIT ?? '10',
);

export const POST = withAuth<void>(async (req, { user }) => {
  const rl = await withRateLimit(user.userId, 'ai_bulk_delete', BULK_DELETE_RATE_LIMIT);
  if (!rl.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many bulk-delete actions (${rl.count}/${rl.limit} per minute).`,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  const deleted = await batchDeleteThreads(user.userId, body.ids);

  return Response.json({ deleted: deleted.length });
});
