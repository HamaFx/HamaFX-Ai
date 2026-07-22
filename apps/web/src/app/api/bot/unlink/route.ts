// SPDX-License-Identifier: Apache-2.0

// /api/bot/unlink — Unlink Telegram from the user's HamaFX account.
// POST /api/bot/unlink

import { unlinkBot } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (_req, { user }) => {
  try {
    await unlinkBot(user.userId, 'telegram');
    return Response.json({ success: true, message: 'Telegram unlinked successfully.' });
  } catch (err) {
    return errorResponse(err);
  }
});
