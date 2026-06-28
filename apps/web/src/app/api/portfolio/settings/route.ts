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

// /api/portfolio/settings — get or update portfolio settings.
// GET  /api/portfolio/settings
// PUT  /api/portfolio/settings

import { getPortfolioSettings, savePortfolioSettings } from '@hamafx/ai';
import { z } from 'zod';
import type { PortfolioSettings } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UpdateSettingsSchema = z.object({
  accountBalance: z.number().nullable().optional(),
  baseCurrency: z.string().optional(),
  maxRiskPerTradePct: z.number().min(0).max(100).optional(),
  maxTotalExposurePct: z.number().min(0).max(100).optional(),
});

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const settings = await getPortfolioSettings(user.userId);
    return Response.json({ settings });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const input = UpdateSettingsSchema.parse(body);

    // Clean undefined values to prevent overwriting existing settings with undefined during spread merges
    const cleaned = Object.fromEntries(
      Object.entries(input).filter(([_, v]) => v !== undefined)
    ) as Partial<Pick<PortfolioSettings, 'accountBalance' | 'baseCurrency' | 'maxRiskPerTradePct' | 'maxTotalExposurePct'>>;

    const settings = await savePortfolioSettings(user.userId, cleaned);
    return Response.json({ settings });
  } catch (err) {
    return errorResponse(err);
  }
});