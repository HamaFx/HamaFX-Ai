// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/settings/bulk-test — bulk BYOK key testing (thin controller).

import { errorResponse, withAuth } from '@/lib/api';
import { bulkTestKeysService } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<void>(async (_req, { user }) => {
  try {
    const { stream } = await bulkTestKeysService(user.userId);
    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson',
        'cache-control': 'no-cache',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
});
