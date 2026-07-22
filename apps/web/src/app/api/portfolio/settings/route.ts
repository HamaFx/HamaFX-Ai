// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/portfolio/settings — get / update settings (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { getPortfolioSettingsService, savePortfolioSettingsService, PortfolioUpdateSettingsSchema } from '@/lib/services/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const result = await getPortfolioSettingsService(user.userId);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await req.json();
    const input = PortfolioUpdateSettingsSchema.parse(body);
    const result = await savePortfolioSettingsService(user.userId, input);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});