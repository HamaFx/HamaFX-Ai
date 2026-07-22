// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/briefings — pre/post-event briefings.
//
// Phase 8 PR-10: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via in-process scheduler.
// The route stays here so we can hand-trigger during a worker outage:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/briefings
//
// Scans `economic_events` twice on each invocation:
//   - pre-event:  events with `date` ∈ [now, now+2h]  → emit
//   - post-event: events with `date` ∈ [now-24h, now-5m] AND `actual IS NOT NULL` → emit
//
// Each emit is idempotent at the (eventId, kind) primary key on
// `briefings_emitted`.

import {
  emitPostEvent,
  emitPreEvent,
  findHighImpactEventsInWindow,
} from '@hamafx/ai';
import { getActiveUserIds } from '@hamafx/db';
import * as Sentry from '@sentry/nextjs';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pre-event: scan high-impact events happening in the next 2 hours. */
const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Post-event catch-up: scan events that happened in the last 30 days. */
const POST_CATCHUP_MS = 30 * 24 * 60 * 60 * 1000;
/** Small offset to avoid picking up events that literally just fired. */
const POST_GRACE_MS = 5 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'briefings' });
  return withCronAuth(req, async () => {
    const now = Date.now();

    // --- Pre-event window: [now, now+2h] ---
    const preCandidates = await findHighImpactEventsInWindow({
      fromMs: now,
      toMs: now + PRE_WINDOW_MS,
    });

    let preEmitted = 0;
    // --- Post-event catch-up: [now-24h, now-5m] AND actual IS NOT NULL ---
    const postCandidates = await findHighImpactEventsInWindow({
      fromMs: now - POST_CATCHUP_MS,
      toMs: now - POST_GRACE_MS,
      requireActual: true,
    });

    let postEmitted = 0;

    const activeUsers = await getActiveUserIds();

    for (const userId of activeUsers) {
      for (const c of preCandidates) {
        try {
          const r = await emitPreEvent(userId, c.id);
          if (r.emitted) preEmitted += 1;
        } catch (err) {
          Sentry.captureException(err, {
            tags: { job: 'cron/briefings', phase: 'pre', eventId: c.id, userId },
          });
          log.errorContext(err, 'emitPreEvent', { eventId: c.id, userId });
        }
      }

      for (const c of postCandidates) {
        try {
          const r = await emitPostEvent(userId, c.id);
          if (r.emitted) postEmitted += 1;
        } catch (err) {
          Sentry.captureException(err, {
            tags: { job: 'cron/briefings', phase: 'post', eventId: c.id, userId },
          });
          log.errorContext(err, 'emitPostEvent', { eventId: c.id, userId });
        }
      }
    }

    return {
      processed: preCandidates.length + postCandidates.length,
      note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
    };
  });
}
