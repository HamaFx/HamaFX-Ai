// SPDX-License-Identifier: Apache-2.0

// /api/bot/link-code — Generate a link code for linking Telegram to HamaFX.
// POST /api/bot/link-code

import { createLinkCode, getBotLink } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (_req, { user }) => {
  try {
    // Check if already linked
    const existing = await getBotLink(user.userId, 'telegram');
    if (existing) {
      return Response.json({
        alreadyLinked: true,
        linkedAt: existing.linkedAt,
        message: 'Your Telegram is already linked. Unlink first to re-link.',
      });
    }

    const { code, expiresAt } = createLinkCode(user.userId);

    return Response.json({
      code,
      expiresAt: expiresAt.toISOString(),
      instructions: [
        '1. Open Telegram and find the HamaFX bot',
        '2. Send: /link ' + code,
        '3. The code expires in 10 minutes',
      ].join('\n'),
    });
  } catch (err) {
    return errorResponse(err);
  }
});
