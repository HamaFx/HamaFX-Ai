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

// /api/journal/[id] — read / patch (close, edit) / delete.

import { deleteEntry, getEntry, updateEntry } from '@hamafx/ai';
import { TradeOutcomeSchema } from '@hamafx/shared';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const entry = await getEntry(user.userId, id);
    if (!entry) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
});

const PatchSchema = z.object({
  closedAt: z.number().int().nullable().optional(),
  exit: z.number().nullable().optional(),
  stop: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  size: z.number().nullable().optional(),
  outcome: TradeOutcomeSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
});

export const PATCH = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const input = await parseJsonBody(req, PatchSchema);
    const entry = await updateEntry(user.userId, id, input);
    if (!entry) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }
    return Response.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const deleted = await deleteEntry(user.userId, id);
    if (!deleted) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'entry not found' } },
        { status: 404 },
      );
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
