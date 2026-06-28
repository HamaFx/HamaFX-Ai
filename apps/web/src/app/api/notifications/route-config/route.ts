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

// /api/notifications/route-config — get or update notification routing config.
// GET  /api/notifications/route-config
// PUT  /api/notifications/route-config

import { getRouteConfig, saveRouteConfig } from '@hamafx/ai';
import { RouteConfigSchema, type RouteConfig } from '@hamafx/shared';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const config = await getRouteConfig(user.userId);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const partial = RouteConfigSchema.partial().parse(body);

    // Clean undefined values to prevent overwriting existing settings with undefined during spread merges
    const cleaned = Object.fromEntries(
      Object.entries(partial).filter(([_, v]) => v !== undefined)
    ) as Partial<RouteConfig>;

    const config = await saveRouteConfig(user.userId, cleaned);
    return Response.json({ config });
  } catch (err) {
    return errorResponse(err);
  }
});