// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/portfolio/positions/[id] — get / close / delete (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { AppError } from '@hamafx/shared';
import { getPositionService, closePositionService, deletePositionService } from '@/lib/services/portfolio';
import { ClosePositionInputSchema } from '@hamafx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { user, params }) => {
  try {
    const { id } = await params;
    const position = await getPositionService(user.userId, id);
    if (!position) {
      return errorResponse(new AppError('NOT_FOUND', 'Position not found', 404));
    }
    return Response.json({ position });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth<{ id: string }>(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = ClosePositionInputSchema.parse(body);
    const position = await closePositionService(user.userId, id, input);
    if (!position) {
      return errorResponse(new AppError('NOT_FOUND', 'Position not found or already closed', 404));
    }
    return Response.json({ position });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth<{ id: string }>(async (_req, { user, params }) => {
  try {
    const { id } = await params;
    await deletePositionService(user.userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
});