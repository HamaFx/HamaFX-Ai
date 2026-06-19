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

// /api/alerts/[id] — read / patch / delete one alert.

import { deleteAlert, getAlert, updateAlert } from '@hamafx/ai';
import { AlertChannelSchema, AlertRuleSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const alert = await getAlert(user.userId, id);
    if (!alert) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'alert not found' } },
        { status: 404 },
      );
    }
    return Response.json({ alert });
  } catch (err) {
    return errorResponse(err);
  }
});

const PatchSchema = z.object({
  rule: AlertRuleSchema.optional(),
  channels: z.array(AlertChannelSchema).optional(),
  note: z.string().max(280).nullable().optional(),
  active: z.boolean().optional(),
  /** Pass `null` to re-arm a fired alert. */
  firedAt: z.number().int().nullable().optional(),
});

export const PATCH = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const input = await parseJsonBody(req, PatchSchema);
    const alert = await updateAlert(user.userId, id, input);
    if (!alert) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'alert not found' } },
        { status: 404 },
      );
    }
    return Response.json({ alert });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    await deleteAlert(user.userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
