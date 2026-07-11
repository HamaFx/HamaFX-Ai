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

// GET /api/cron/briefings — pre/post-event briefings.
//
// Phase 8 PR-10: this route is now a **manual-fallback path**. The
// scheduled invocation runs on the GCE worker via
// `hamafx-job-briefings.timer`. The route stays here so we can hand-trigger
// during a worker outage:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/cron/briefings
//
// Scans `economic_events` twice on each invocation:
//   - pre-event:  events with `date` ∈ [now+28m, now+32m]  → emit
//   - post-event: events with `date` ∈ [now-32m, now-28m] AND `actual IS NOT NULL` → emit
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

const PRE_OFFSET_MS = 30 * 60 * 1000;
const WINDOW_MS = 4 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'briefings' });
  return withCronAuth(req, async () => {
    const now = Date.now();

    // --- Pre-event window: [now+28m, now+32m] ---
    const preCandidates = await findHighImpactEventsInWindow({
      fromMs: now + PRE_OFFSET_MS - WINDOW_MS / 2,
      toMs: now + PRE_OFFSET_MS + WINDOW_MS / 2,
    });

    let preEmitted = 0;
    // --- Post-event window: [now-32m, now-28m] AND actual IS NOT NULL ---
    const postCandidates = await findHighImpactEventsInWindow({
      fromMs: now - PRE_OFFSET_MS - WINDOW_MS / 2,
      toMs: now - PRE_OFFSET_MS + WINDOW_MS / 2,
      requireActual: true,
    });

    let postEmitted = 0;

    // Phase 3 §3.11 — iterate over real active users instead of the
    // hardcoded '__system__' fallback. In self-host / legacy mode this
    // returns ['__system__'] (the only user).
    const activeUsers = await getActiveUserIds();

    for (const userId of activeUsers) {
      for (const c of preCandidates) {
        try {
          const r = await emitPreEvent(userId, c.id);
          if (r.emitted) preEmitted += 1;
        } catch (err) {
          // STAB-04 / OBS-01: capture to Sentry.
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
          // STAB-04 / OBS-01: capture to Sentry.
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
