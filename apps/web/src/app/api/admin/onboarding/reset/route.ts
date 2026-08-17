// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { getUserById, resetOnboarding } from '@/lib/services/api-boundary';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';
import { recordAdminAudit } from '@/lib/services/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const resetSchema = z.object({
  userId: z.string().optional(),
  mode: z.enum(['full', 'soft']).default('soft'),
});

export const POST = withAdminAuth(async (req, { user: admin }) => {
  const body = await parseJsonBody(req, resetSchema);
  // The admin inspector can submit an empty-string userId to mean "my own
  // account". Treat blank/whitespace values as unset so they fall back to
  // the authenticated admin instead of failing the user lookup.
  const targetUserId = body.userId?.trim() || admin.userId;

  // Verify target user exists
  const targetUser = await getUserById(targetUserId);

  if (!targetUser) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
  }

  await resetOnboarding(targetUserId, body.mode);

  await recordAdminAudit(admin.userId, 'onboarding.reset', targetUserId, { mode: body.mode });

  return Response.json({ ok: true, userId: targetUserId, reset: true, mode: body.mode });
});
