// SPDX-License-Identifier: Apache-2.0

// PF-22 — /api/admin/features — feature flags (thin controller).

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseJsonBody } from '@/lib/api';
import { listFeaturesService, upsertFeaturesService } from '@/lib/services/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toggleSchema = z.record(z.boolean());

export const GET = withAdminAuth(async () => {
  const result = await listFeaturesService();
  return Response.json(result);
});

export const POST = withAdminAuth(async (req, { user }) => {
  const body = await parseJsonBody(req, toggleSchema);
  await upsertFeaturesService(body, user.userId);
  return Response.json({ ok: true });
});
