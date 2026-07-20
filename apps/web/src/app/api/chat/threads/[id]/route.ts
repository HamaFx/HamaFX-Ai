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

// PF-22 — /api/chat/threads/[id] — read / patch / delete (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getThreadService, getThreadWithMessagesService, deleteThreadService, updateThreadPinnedSymbolService } from '@/lib/services/chat';
import { z } from 'zod';

const PatchBodySchema = z.object({
  pinnedSymbol: z.string().nullable(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const fields = new URL(req.url).searchParams.get('fields');

    if (fields === 'thread') {
      const thread = await getThreadService(user.userId, id);
      if (!thread) {
        return Response.json({ error: { code: 'NOT_FOUND', message: 'thread not found' } }, { status: 404 });
      }
      return Response.json({ thread });
    }

    const result = await getThreadWithMessagesService(user.userId, id);
    if (!result) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'thread not found' } }, { status: 404 });
    }
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    await deleteThreadService(user.userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const body = await parseJsonBody(req, PatchBodySchema);
    const ok = await updateThreadPinnedSymbolService(user.userId, id, body.pinnedSymbol);
    if (!ok) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'thread not found' } }, { status: 404 });
    }
    const thread = await getThreadService(user.userId, id);
    return Response.json({ thread });
  } catch (err) {
    return errorResponse(err);
  }
});
