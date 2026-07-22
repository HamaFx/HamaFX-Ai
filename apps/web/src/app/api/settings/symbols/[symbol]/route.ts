// SPDX-License-Identifier: Apache-2.0

import { withAuth, errorResponse } from '@/lib/api';
import { removeUserSymbol } from '@hamafx/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withAuth<{ symbol: string }>(async (_req, { params, user }) => {
  try {
    const { symbol } = await params;
    await removeUserSymbol(user.userId, symbol);
    return Response.json({ ok: true, symbol });
  } catch (err) {
    return errorResponse(err);
  }
});
