// SPDX-License-Identifier: Apache-2.0

// /api/notifications/route-config — get or update notification routing config.
// GET  /api/notifications/route-config
// PUT  /api/notifications/route-config

import { getRouteConfig, saveRouteConfig } from '@/lib/services/api-boundary';
import { RouteConfigSchema, type RouteConfig } from '@/lib/services/api-boundary';

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