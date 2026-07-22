// SPDX-License-Identifier: Apache-2.0

// /api/bot/status — Get the current bot linking status for the user.
// GET /api/bot/status

import { getBotLink } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const link = await getBotLink(user.userId, 'telegram');
    return Response.json({
      linked: !!link,
      ...(link ? { linkedAt: link.linkedAt.toISOString() } : {}),
    });
  } catch (err) {
    return errorResponse(err);
  }
});
