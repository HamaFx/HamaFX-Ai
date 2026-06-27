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

// /api/alerts — list / create.

import { createAlert, listAlerts } from '@hamafx/ai';
import { AlertChannelSchema, AlertRuleSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { withRateLimit } from '@hamafx/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === '1';
    const alerts = await listAlerts(user.userId, { activeOnly });
    return Response.json({ alerts });
  } catch (err) {
    return errorResponse(err);
  }
});

const CreateSchema = z.object({
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  note: z.string().max(280).nullable().default(null),
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. Snooze in hours
   * (0..168). 0 = one-shot (legacy). Default 0 so existing
   * callers don't need to change.
   */
  snoozeHours: z.number().int().min(0).max(168).default(0),
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    // STAB-12: Limit alert creation to 60 per user per minute.
    const rl = await withRateLimit(user.userId, 'alerts_create', 60);
    if (!rl.allowed) {
      return Response.json({ error: 'Too many requests' }, { status: 429 });
    }

    const input = await parseJsonBody(req, CreateSchema);
    const alert = await createAlert({ ...input, userId: user.userId });
    return Response.json({ alert }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});
