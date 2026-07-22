// SPDX-License-Identifier: Apache-2.0

// /api/settings/usage-by-provider — per-provider usage breakdown.
//
// Phase D — api-keys page overhaul.
//
// Returns the same UsageStats as /settings/usage (via computeUsage)
// but optimised for the api-keys page: the response is the same
// shape; the api-keys page just consumes `byProvider` directly
// instead of `byModel`. We re-use computeUsage to keep the
// aggregation logic single-sourced.
//
// Auth: NextAuth session gate. Per-user data only.

import { computeUsage } from '@hamafx/ai';

import { errorResponse, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<void>(async (_req, { user }) => {
  try {
    const stats = await computeUsage(user.userId);
    return Response.json({
      // Trim the response down to the per-provider breakdown plus
      // a couple of summary fields the api-keys page uses for the
      // header chip ("X cost this month across N providers").
      byProvider: stats.byProvider,
      thirtyDayUsd: stats.thirtyDayUsd,
      thirtyDayTurns: stats.thirtyDayTurns,
    });
  } catch (err) {
    return errorResponse(err);
  }
});
