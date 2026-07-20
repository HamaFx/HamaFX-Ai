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

import { getUserById, resetOnboarding } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';

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

  return Response.json({ ok: true, userId: targetUserId, reset: true, mode: body.mode });
});
