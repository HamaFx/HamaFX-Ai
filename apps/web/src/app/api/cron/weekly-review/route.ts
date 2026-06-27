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

// GET /api/cron/weekly-review — Sunday 18:00 UTC.
//
// Phase 8 PR-14: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via
// `hamafx-job-weekly-review.timer`.
//
// Calls `emitWeeklyReview` exactly once. Idempotent within an ISO week
// via `briefings_emitted` PK on (`weekly_review:<isoWeek>`, 'weekly_review').

import { emitWeeklyReview } from '@hamafx/ai';
import * as Sentry from '@sentry/nextjs';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    // Temporary: Iterate over system user until NextAuth is implemented
    const activeUsers = ['__system__'];
    let emittedCount = 0;
    const reasons: string[] = [];

    for (const userId of activeUsers) {
      try {
        const r = await emitWeeklyReview(userId);
        if (r.emitted) emittedCount++;
        if (r.reason) reasons.push(`[${userId}]: ${r.reason}`);
      } catch (err) {
        // STAB-04 / OBS-01: capture to Sentry.
        Sentry.captureException(err, { tags: { job: 'cron/weekly-review', userId } });
        console.error(`[cron weekly-review] for user ${userId} failed`, err);
        reasons.push(`[${userId}]: error`);
      }
    }

    return {
      processed: emittedCount,
      ...(reasons.length > 0 ? { note: reasons.join(', ') } : {}),
    };
  });
}
