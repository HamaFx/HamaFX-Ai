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

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRE_OFFSET_MS = 30 * 60 * 1000;
const WINDOW_MS = 4 * 60 * 1000;

export async function GET(req: Request): Promise<Response> {
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

    // Temporary: Iterate over system user until NextAuth is implemented
    const activeUsers = ['__system__'];

    for (const userId of activeUsers) {
      for (const c of preCandidates) {
        try {
          const r = await emitPreEvent(userId, c.id);
          if (r.emitted) preEmitted += 1;
        } catch (err) {
          console.error(`[cron briefings] pre ${c.id} for user ${userId} failed`, err);
        }
      }

      for (const c of postCandidates) {
        try {
          const r = await emitPostEvent(userId, c.id);
          if (r.emitted) postEmitted += 1;
        } catch (err) {
          console.error(`[cron briefings] post ${c.id} for user ${userId} failed`, err);
        }
      }
    }

    return {
      processed: preCandidates.length + postCandidates.length,
      note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
    };
  });
}
