// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/alerts/[id] — read / patch / delete one alert (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { AlertPatchSchema, getAlertService, updateAlertService, deleteAlertService } from '@/lib/services/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { params, user }) => {
  try {
    const { id } = await params;
    const alert = await getAlertService(user.userId, id);
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

export const PATCH = withAuth<{ id: string }>(async (req, { params, user }) => {
  try {
    const { id } = await params;
    const input = await parseJsonBody(req, AlertPatchSchema);
    const alert = await updateAlertService(user.userId, id, input);
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
    await deleteAlertService(user.userId, id);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});
