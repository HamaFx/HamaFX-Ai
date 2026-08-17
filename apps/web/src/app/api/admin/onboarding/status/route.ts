// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { getUserWithSettings, listUserSymbols } from '@/lib/services/api-boundary';
import { DEFAULT_WATCHLIST_SYMBOLS } from '@/lib/services/api-boundary';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  userId: z.string().optional(),
});

export const GET = withAdminAuth(async (req, { user: admin }) => {
  const { userId } = parseSearchParams(req, querySchema);
  // Blank/whitespace userId means "my own account". Fall back to the admin.
  const targetUserId = userId?.trim() || admin.userId;

  const { settings } = await getUserWithSettings(targetUserId);
  const symbols = await listUserSymbols(targetUserId);

  return Response.json({
    userId: targetUserId,
    onboardingCompleted: settings?.onboardingCompleted ?? false,
    onboardingProgress: settings?.onboardingProgress ?? null,
    defaultSymbol: settings?.defaultSymbol ?? DEFAULT_WATCHLIST_SYMBOLS[0],
    timezone: settings?.timezone ?? 'UTC',
    watchlist: symbols.map((s) => s.symbol),
  });
});
