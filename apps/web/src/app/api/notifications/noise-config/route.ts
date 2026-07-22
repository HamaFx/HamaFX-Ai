// SPDX-License-Identifier: Apache-2.0

// /api/notifications/noise-config — get or update noise control config.
// GET  /api/notifications/noise-config
// PUT  /api/notifications/noise-config

import { getNoiseConfig, saveNoiseConfig } from '@hamafx/ai';
import { NoiseConfigSchema, type NoiseConfig } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const config = await getNoiseConfig(user.userId);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    // Validate partial config — allow partial updates
    const partial = NoiseConfigSchema.partial().parse(body);

    // Clean undefined values to prevent overwriting existing settings with undefined during spread merges
    const cleaned = Object.fromEntries(
      Object.entries(partial).filter(([_, v]) => v !== undefined)
    ) as Partial<NoiseConfig>;

    const config = await saveNoiseConfig(user.userId, cleaned);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});