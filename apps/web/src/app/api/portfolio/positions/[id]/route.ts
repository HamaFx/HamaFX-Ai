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

// /api/portfolio/positions/[id] — get, close, or delete a specific position.
// GET    /api/portfolio/positions/[id]
// PATCH  /api/portfolio/positions/[id]  (close position)
// DELETE /api/portfolio/positions/[id]

import { closePosition, deletePosition, getPosition } from '@hamafx/ai';
import { ClosePositionInputSchema } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { user, params }) => {
  try {
    const position = await getPosition(user.userId, params.id);
    if (!position) {
      return Response.json({ error: 'Position not found' }, { status: 404 });
    }
    return Response.json({ position });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth<{ id: string }>(async (req, { user, params }) => {
  try {
    const body = await req.json();
    const input = ClosePositionInputSchema.parse(body);

    const position = await closePosition(user.userId, params.id, input);
    if (!position) {
      return Response.json({ error: 'Position not found or already closed' }, { status: 404 });
    }
    return Response.json({ position });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { user, params }) => {
  try {
    await deletePosition(user.userId, params.id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
});