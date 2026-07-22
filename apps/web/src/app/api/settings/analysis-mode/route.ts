// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/settings/analysis-mode — analysis mode settings (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { AnalysisModePatchSchema, getAnalysisModeService, updateAnalysisModeService } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const result = await getAnalysisModeService(user.userId);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});

export const PATCH = withAuth<void>(async (req, { user }) => {
  try {
    const body = await parseJsonBody(req, AnalysisModePatchSchema);
    await updateAnalysisModeService(user.userId, body);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
});