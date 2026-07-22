// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { getUserWithSettings, listUserSymbols } from '@hamafx/db';
import { decryptByok } from '@hamafx/shared/encryption';

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

  let hasApiKeys = false;
  let apiProviders: string[] = [];
  if (settings?.aiApiKeys) {
    try {
      const decrypted = decryptByok(settings.aiApiKeys);
      if (decrypted && typeof decrypted === 'object') {
        apiProviders = Object.entries(decrypted)
          .filter(([, value]) => typeof value === 'string' && value.length > 0)
          .map(([key]) => key);
        hasApiKeys = apiProviders.length > 0;
      }
    } catch {
      // If decryption fails, report no keys (keys may be from a different secret)
    }
  }

  return Response.json({
    userId: targetUserId,
    onboardingCompleted: settings?.onboardingCompleted ?? false,
    onboardingProgress: settings?.onboardingProgress ?? null,
    userSettings: {
      defaultSymbol: settings?.defaultSymbol ?? 'XAUUSD',
      timezone: settings?.timezone ?? 'UTC',
      language: settings?.language ?? 'en',
    },
    watchlist: symbols.map((s) => s.symbol),
    hasApiKeys,
    apiProviders,
  });
});
