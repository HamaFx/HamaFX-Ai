// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/weekly-review — Sunday 18:00 UTC.
//
// Phase 8 PR-14: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via
// `hamafx-job-weekly-review.timer`.
//
// Calls `emitWeeklyReview` exactly once. Idempotent within an ISO week
// via `briefings_emitted` PK on (`weekly_review:<isoWeek>`, 'weekly_review').

import { emitWeeklyReview } from '@hamafx/ai';
import { getActiveUserIds } from '@hamafx/db';
import * as Sentry from '@sentry/nextjs';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'weekly-review' });
  return withCronAuth(req, async () => {
    // Phase 3 §3.11 — iterate over real active users instead of the
    // hardcoded '__system__' fallback. In self-host / legacy mode this
    // returns ['__system__'] (the only user).
    const activeUsers = await getActiveUserIds();
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
        log.errorContext(err, 'emitWeeklyReview', { userId });
        reasons.push(`[${userId}]: error`);
      }
    }

    return {
      processed: emittedCount,
      ...(reasons.length > 0 ? { note: reasons.join(', ') } : {}),
    };
  });
}
