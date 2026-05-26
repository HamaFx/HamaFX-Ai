// GET /api/cron/calendar — pulls upcoming FRED release dates and upserts
// economic_events. Phase 1c uses FRED only (Trading Economics deferred per
// docs/09a). Forecast/actual values land in a follow-up that hits
// /fred/series/observations after each release.

import { upsertEvents } from '@hamafx/ai';
import { fetchUpcomingEvents } from '@hamafx/data';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const events = await fetchUpcomingEvents();
    const { inserted } = await upsertEvents(events);
    return {
      processed: events.length,
      note: `upserted=${inserted}`,
    };
  });
}
