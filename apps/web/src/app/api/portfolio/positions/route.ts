// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/portfolio/positions — list / create positions (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { listPositionsService, createPositionService } from '@/lib/services/portfolio';
import { CreatePositionInputSchema } from '@hamafx/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (req, { user }) => {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? undefined;
    const result = await listPositionsService(user.userId, status);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const input = CreatePositionInputSchema.parse(body);
    const result = await createPositionService(user.userId, input);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});