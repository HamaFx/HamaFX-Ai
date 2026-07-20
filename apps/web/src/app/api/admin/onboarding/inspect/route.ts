/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
