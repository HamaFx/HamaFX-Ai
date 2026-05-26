// GET /api/cron/briefings — pre/post-event briefings.
//
// Scans `economic_events` twice on each invocation:
//   - pre-event:  events with `date` ∈ [now+28m, now+32m]  → emit
//   - post-event: events with `date` ∈ [now-32m, now-28m] AND `actual IS NOT NULL` → emit
//
// Each emit is idempotent at the (eventId, kind) primary key on
// `briefings_emitted`, so the 5-minute cron cadence on GitHub Actions
// (with possible drift) is safe.

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
    for (const c of preCandidates) {
      try {
        const r = await emitPreEvent(c.id);
        if (r.emitted) preEmitted += 1;
      } catch (err) {
        console.error(`[cron briefings] pre ${c.id} failed`, err);
      }
    }

    // --- Post-event window: [now-32m, now-28m] AND actual IS NOT NULL ---
    const postCandidates = await findHighImpactEventsInWindow({
      fromMs: now - PRE_OFFSET_MS - WINDOW_MS / 2,
      toMs: now - PRE_OFFSET_MS + WINDOW_MS / 2,
      requireActual: true,
    });

    let postEmitted = 0;
    for (const c of postCandidates) {
      try {
        const r = await emitPostEvent(c.id);
        if (r.emitted) postEmitted += 1;
      } catch (err) {
        console.error(`[cron briefings] post ${c.id} failed`, err);
      }
    }

    return {
      processed: preCandidates.length + postCandidates.length,
      note: `pre=${preEmitted}/${preCandidates.length}, post=${postEmitted}/${postCandidates.length}`,
    };
  });
}
