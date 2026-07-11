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

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb, schema } from '@hamafx/db';

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

  const db = getDb();
  const [settings] = await db
    .select({
      onboardingCompleted: schema.userSettings.onboardingCompleted,
      onboardingProgress: schema.userSettings.onboardingProgress,
      defaultSymbol: schema.userSettings.defaultSymbol,
      timezone: schema.userSettings.timezone,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, targetUserId));

  const symbols = await db
    .select({ symbol: schema.userSymbols.symbol })
    .from(schema.userSymbols)
    .where(eq(schema.userSymbols.userId, targetUserId))
    .orderBy(schema.userSymbols.displayOrder);

  return Response.json({
    userId: targetUserId,
    onboardingCompleted: settings?.onboardingCompleted ?? false,
    onboardingProgress: settings?.onboardingProgress ?? null,
    defaultSymbol: settings?.defaultSymbol ?? 'XAUUSD',
    timezone: settings?.timezone ?? 'UTC',
    watchlist: symbols.map((s) => s.symbol),
  });
});
