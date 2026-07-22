// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/alerts/preview-digest — noise config preview (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { previewDigestService } from '@/lib/services/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const result = await previewDigestService(user.userId);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
});
