// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { listToolTelemetry } from '@hamafx/db';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  threadId: z.string().optional(),
  ok: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = withAdminAuth(async (req) => {
  const { threadId, ok, limit } = parseSearchParams(req, querySchema);

  const entries = await listToolTelemetry({ threadId, limit });

  const filtered = ok ? entries.filter((e) => (ok === 'true' ? e.ok : !e.ok)) : entries;

  return Response.json({ entries: filtered });
});
