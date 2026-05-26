// Calendar persistence — upsert EconomicEvent[] into the DB.
// Same shape as news-persistence.ts so the cron handler stays uniform.

import { getDb, schema } from '@hamafx/db';
import type { EconomicEvent } from '@hamafx/shared';

export async function upsertEvents(
  events: EconomicEvent[],
): Promise<{ inserted: number; skipped: number }> {
  if (events.length === 0) return { inserted: 0, skipped: 0 };

  const rows = events.map((e) => ({
    id: e.id,
    title: e.title,
    country: e.country,
    currency: e.currency,
    importance: e.importance,
    date: new Date(e.date),
    actual: e.actual,
    forecast: e.forecast,
    previous: e.previous,
    unit: e.unit,
    source: e.source,
  }));

  // ON CONFLICT (id) DO UPDATE — we DO want to refresh actual/forecast/previous
  // when a release is reported, since FRED schedules ahead of time and the
  // numeric fields land later.
  const inserted = await getDb()
    .insert(schema.economicEvents)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.economicEvents.id,
      set: {
        actual: schema.economicEvents.actual,
        forecast: schema.economicEvents.forecast,
        previous: schema.economicEvents.previous,
        date: schema.economicEvents.date,
      },
    })
    .returning({ id: schema.economicEvents.id });

  return { inserted: inserted.length, skipped: 0 };
}
