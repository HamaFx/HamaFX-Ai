// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/chat/threads/[id] — read / patch / delete (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { getThreadService, getThreadWithMessagesService, deleteThreadService, updateThreadPinnedSymbolService, updateThreadAnalysisModeService } from '@/lib/services/chat';
import { z } from 'zod';

const PatchBodySchema = z
  .object({
    pinnedSymbol: z.string().nullable().optional(),
    analysisMode: z.enum(['single', 'quick', 'standard', 'full', 'auto']).nullable().optional(),
  })
  .refine((body) => body.pinnedSymbol !== undefined || body.analysisMode !== undefined, {
    message: 'At least one thread setting is required',
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
    const ok = body.analysisMode !== undefined
      ? await updateThreadAnalysisModeService(user.userId, id, body.analysisMode)
      : await updateThreadPinnedSymbolService(user.userId, id, body.pinnedSymbol ?? null);
    if (!ok) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'thread not found' } }, { status: 404 });
    }
    const thread = await getThreadService(user.userId, id);
    return Response.json({ thread });
  } catch (err) {
    return errorResponse(err);
  }
});
