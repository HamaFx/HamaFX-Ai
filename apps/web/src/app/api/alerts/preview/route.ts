// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/alerts/preview — alert simulator (thin controller).

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';
import { AlertPreviewBodySchema, previewAlertRuleService } from '@/lib/services/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (req, { user }) => {
  try {
    const input = await parseJsonBody(req, AlertPreviewBodySchema);
    const result = await previewAlertRuleService(user.userId, input);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err, req);
  }
});
