// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { getUserById } from '@hamafx/db';
import { signIn, generateImpersonationChallenge } from '@/auth';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const impersonateSchema = z.object({
  userId: z.string(),
});

export const POST = withAdminAuth(async (req) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_IMPERSONATION !== 'true') {
    return Response.json({ error: { code: 'FORBIDDEN', message: 'Impersonation is disabled' } }, { status: 403 });
  }

  const { userId } = await parseJsonBody(req, impersonateSchema);

  const targetUser = await getUserById(userId);

  if (!targetUser) {
    return Response.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
  }

  try {
    // H-1: Generate a signed challenge token that the impersonation
    // provider verifies. This prevents direct calls to the impersonation
    // provider from bypassing the admin check in this route.
    const challenge = generateImpersonationChallenge();
    await signIn('impersonate', { userId, challenge, redirect: false });
    return Response.json({ ok: true, redirect: '/chat' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: { code: 'INTERNAL', message } }, { status: 500 });
  }
});
