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

// /api/notifications/noise-config — get or update noise control config.
// GET  /api/notifications/noise-config
// PUT  /api/notifications/noise-config

import { getNoiseConfig, saveNoiseConfig } from '@hamafx/ai';
import { NoiseConfigSchema } from '@hamafx/shared';

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

    const config = await saveNoiseConfig(user.userId, partial);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});