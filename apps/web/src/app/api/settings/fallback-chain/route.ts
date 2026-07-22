// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/settings/fallback-chain — AI provider fallback chain (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { FallbackChainPutSchema, getFallbackChainService, updateFallbackChainService } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const result = await getFallbackChainService(user.userId);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const PUT = withAuth<void>(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, FallbackChainPutSchema);
    const result = await updateFallbackChainService(user.userId, body.fallbackChain);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
});
