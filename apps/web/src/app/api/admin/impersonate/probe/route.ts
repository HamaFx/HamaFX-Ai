// SPDX-License-Identifier: Apache-2.0

// GET /api/admin/impersonate/probe
//
// Returns whether impersonation is currently enabled. The client uses
// this to decide whether to render the impersonate UI.

import { withAdminAuth } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminAuth(async () => {
  const enabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.ENABLE_IMPERSONATION === 'true';

  return Response.json({ enabled });
});
