// SPDX-License-Identifier: Apache-2.0

// GET /api/cron/calendar — pulls upcoming FRED release dates and upserts
// economic_events. Phase 1c uses FRED only; the adapter has no failover
// because there's only one provider. When FRED times out (which it does
// once or twice an hour) we DON'T want the cron handler to 500 — that
// just spams /var/log/hamafx-cron.log with FAIL lines and provides no
// actionable signal. Treat ProviderError as a "skip this tick" event:
// the next tick will retry, the data we already have stays valid.

import { upsertEvents } from '@hamafx/ai';
import { fetchUpcomingEvents, ProviderError } from '@hamafx/data';

import { withCronAuth } from '@/lib/cron';
import { createScopedLoggerWithContext } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  const log = createScopedLoggerWithContext({ component: 'cron', job: 'calendar' });
  return withCronAuth(req, async () => {
    try {
      const events = await fetchUpcomingEvents();
      const { inserted } = await upsertEvents(events);
      return {
        processed: events.length,
        note: `upserted=${inserted}`,
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        // Upstream blip — log once, skip this tick, return 200 with note.
        log.warn('provider skipped', {
          provider: err.provider,
          code: err.code,
          message: err.message,
        });
        return {
          processed: 0,
          note: `provider ${err.provider} unavailable (${err.code})`,
        };
      }
      throw err;
    }
  });
}
