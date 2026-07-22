// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/portfolio/risk — risk report (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { getRiskReportService } from '@/lib/services/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const result = await getRiskReportService(user.userId);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});