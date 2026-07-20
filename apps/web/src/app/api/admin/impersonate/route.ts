/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
