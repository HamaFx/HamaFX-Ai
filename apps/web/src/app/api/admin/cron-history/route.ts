// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { listCronRuns } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  jobName: z.string().optional(),
});

export const GET = withAdminAuth(async (req) => {
  const { days, jobName } = parseSearchParams(req, querySchema);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const runs = await listCronRuns({ since, jobName });

  return Response.json({ runs });
});
