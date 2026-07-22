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

// POST /api/push/subscribe
//
// Persists a browser-issued PushSubscription. Idempotent on `endpoint`
// (re-subscribing from the same browser overwrites `p256dh`/`auth`).
//
// Gated by the password cookie middleware. Returns:
//   200 { id }                       on success
//   400 { error: 'invalid_body' }    on schema parse failure
//   401 { error: 'unauthorized' }    when the session cookie is missing/invalid
//   503 { missing: string[] }        when VAPID keys are not configured

import { savePushSubscription } from '@hamafx/ai';
import { withRateLimit } from '@hamafx/db';
import { AppError } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = withAuth<void>(async (req, { user }) => {
  // STAB-12: Rate limit — 10 subscribe attempts per user per minute.
  const rl = await withRateLimit(user.userId, 'push_subscribe', 10);
  if (!rl.allowed) {
    return errorResponse(new AppError('RATE_LIMITED', 'Too many requests', 429), req);
  }

  const missing: string[] = [];
  if (!process.env.VAPID_PUBLIC_KEY) missing.push('VAPID_PUBLIC_KEY');
  if (!process.env.VAPID_PRIVATE_KEY) missing.push('VAPID_PRIVATE_KEY');
  if (missing.length > 0) {
    return Response.json({ missing }, { status: 503 });
  }

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

  const userAgent = req.headers.get('user-agent') ?? null;
  const row = await savePushSubscription({
    userId: user.userId,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent,
  });

  return Response.json({ id: row.id }, { status: 200 });
});
