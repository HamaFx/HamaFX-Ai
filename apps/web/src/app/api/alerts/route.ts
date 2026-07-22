// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/alerts — list / create (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { AlertCreateSchema, listAlertsService, createAlertService } from '@/lib/services/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const activeOnly = url.searchParams.get('active') === '1';
    const result = await listAlertsService(user.userId, { activeOnly });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, req);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const input = await parseJsonBody(req, AlertCreateSchema);
    const result = await createAlertService(user.userId, input);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err, req);
  }
});
