// /calendar — server-rendered list of upcoming/recent macro events.
// FRED-only in Phase 1c; the schema has placeholders for actual / forecast /
// previous which a future cron will populate from /fred/series/observations.

import type { Metadata } from 'next';

import { listUpcomingEvents } from '@hamafx/ai';
import type { EconomicEvent } from '@hamafx/shared';

import { EventCard } from '@/components/calendar/event-card';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const events = await listUpcomingEvents();

  // Group by calendar day so the list reads naturally.
  const groups = new Map<string, EconomicEvent[]>();
  for (const e of events) {
    const key = new Date(e.date).toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Calendar"
        description="Upcoming macro events that move XAU / EUR / GBP / USD."
      />

      {events.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-fg-subtle px-1 text-xs uppercase tracking-wide">{dayLabel(day)}</h2>
              <ul className="flex flex-col gap-2">
                {items.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function EmptyState() {
  return (
    <div className="text-fg-muted border-border rounded-lg border border-dashed p-6 text-center text-sm">
      <p className="mb-1 font-medium">No events scheduled in the next 14 days.</p>
      <p className="text-fg-subtle text-xs">
        Trigger ingestion once via{' '}
        <code className="bg-bg-elev-2 rounded px-1 py-0.5 text-[10px]">
          curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; .../api/cron/calendar
        </code>
        .
      </p>
    </div>
  );
}
