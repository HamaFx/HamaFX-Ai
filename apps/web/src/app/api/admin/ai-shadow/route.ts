// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

import { withAdminAuth } from '@/lib/admin-auth';
import { parseSearchParams } from '@/lib/api';
import {
  listAiShadowComparisons,
  summarizeAiShadowComparisons,
} from '@/lib/services/api-boundary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(168),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const GET = withAdminAuth(async (req) => {
  const { hours, limit } = parseSearchParams(req, querySchema);
  const rows = await listAiShadowComparisons({
    limit,
    from: new Date(Date.now() - hours * 60 * 60 * 1000),
  });

  return Response.json({
    hours,
    summary: summarizeAiShadowComparisons(rows),
    comparisons: rows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      promptSha256: row.promptSha256,
      primaryAgent: row.primaryAgent,
      outcome: row.outcome,
      failureReason: row.failureReason,
      legacyChars: row.legacyChars,
      mastraChars: row.mastraChars,
      sharedTokenRatio: row.sharedTokenRatio,
      overlap: row.overlap,
      mastraVerified: row.mastraVerified,
      mastraBias: row.mastraBias,
      mastraDataQuality: row.mastraDataQuality,
      primaryLatencyMs: row.primaryLatencyMs,
      shadowLatencyMs: row.shadowLatencyMs,
      primaryCostUsd: row.primaryCostUsd,
      shadowCostUsd: row.shadowCostUsd,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});
