// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { getUserWithSettings, listUserSymbols } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  userId: z.string().optional(),
});

export const GET = withAdminAuth(async (req, { user: admin }) => {
  const { userId } = parseSearchParams(req, querySchema);
  const targetUserId = userId ?? admin.userId;

  const { settings } = await getUserWithSettings(targetUserId);
  const symbols = await listUserSymbols(targetUserId);

  return Response.json({
    userId: targetUserId,
    onboardingCompleted: settings?.onboardingCompleted ?? false,
    onboardingProgress: settings?.onboardingProgress ?? null,
    defaultSymbol: settings?.defaultSymbol ?? 'XAUUSD',
    timezone: settings?.timezone ?? 'UTC',
    watchlist: symbols.map((s) => s.symbol),
  });
});
