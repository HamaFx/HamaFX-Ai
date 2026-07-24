// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { getUserById, resetOnboarding } from '@hamafx/db';

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
  const targetUserId = body.userId ?? admin.userId;

  // Verify target user exists
  const targetUser = await getUserById(targetUserId);

  if (!targetUser) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
  }

  await resetOnboarding(targetUserId, body.mode);

  await recordAdminAudit(admin.userId, 'onboarding.reset', targetUserId, { mode: body.mode });

  return Response.json({ ok: true, userId: targetUserId, reset: true, mode: body.mode });
});
