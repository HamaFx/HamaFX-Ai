// SPDX-License-Identifier: Apache-2.0

// PR-06: SLI/SLO health metrics endpoint for the System Health dashboard.
//
// Thin controller — all computation lives in
// `src/lib/services/admin-health.ts`.

import { z } from 'zod';

import { getDb } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import { computeHealthSloService } from '@/lib/services/admin-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  /** Window in hours for SLI computation. Default 24. Max 720 (30 days). */
  hours: z.coerce.number().int().min(1).max(720).default(24),
});

export const GET = withAdminAuth(async (req) => {
  const { hours } = parseSearchParams(req, querySchema);

  const db = getDb();
  const response = await computeHealthSloService(db, { hours });

  return Response.json(response);
});
