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

// POST /api/push/unsubscribe
//
// Deletes a browser-issued PushSubscription by its `endpoint`. Always
// responds 200, even when the row was already gone — unsubscribing should
// be idempotent from the caller's perspective.
//
// Gated by the password cookie middleware.

import { deletePushSubscriptionByEndpoint } from '@hamafx/ai';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  endpoint: z.string().url(),
});

export const POST = withAuth<void>(async (req, { user }) => {
  let body: z.infer<typeof BodySchema>;
  try { body = await parseJsonBody(req, BodySchema); } catch (err) { return errorResponse(err); }

  await deletePushSubscriptionByEndpoint(user.userId, body.endpoint);
  return Response.json({ ok: true }, { status: 200 });
});
