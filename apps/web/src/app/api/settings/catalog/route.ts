// SPDX-License-Identifier: Apache-2.0

import { withAuth, errorResponse } from '@/lib/api';
import { buildCatalogForUser } from '@/lib/catalog-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const catalog = await buildCatalogForUser(user.userId);
    return Response.json(catalog);
  } catch (err) {
    return errorResponse(err);
  }
});