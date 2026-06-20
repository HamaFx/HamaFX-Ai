/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
