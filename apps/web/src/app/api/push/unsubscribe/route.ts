// SPDX-License-Identifier: Apache-2.0

// POST /api/push/unsubscribe
//
// Deletes a browser-issued PushSubscription by its `endpoint`. Always
// responds 200, even when the row was already gone — unsubscribing should
// be idempotent from the caller's perspective.
//
// Gated by the request proxy auth gate.

import { deletePushSubscriptionByEndpoint } from '@/lib/services/api-boundary';
import { AppError } from '@/lib/services/api-boundary';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  endpoint: z.string().url(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(new AppError('VALIDATION', 'Invalid request body', 400, { issues: parsed.error.issues }), req);
  }

  await deletePushSubscriptionByEndpoint(user.userId, parsed.data.endpoint);
  return Response.json({ ok: true }, { status: 200 });
});
