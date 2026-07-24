// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/admin/users — list users (thin controller).

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import { listUsersService } from '@/lib/services/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().optional(),
});

export const GET = withAdminAuth(async (req) => {
  const { limit, offset, q } = parseSearchParams(req, querySchema);
  const result = await listUsersService(limit, offset, q);
  return Response.json(result);
});
