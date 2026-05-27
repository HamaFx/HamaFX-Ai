// /calendar — server-rendered list of upcoming/recent macro events.
// Mobile-first: events grouped by day, sticky day header offset under the
// shared TopBar via --topbar-h.

import { listUpcomingEvents } from '@hamafx/ai';
import type { EconomicEvent } from '@hamafx/shared';
import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';

import { EventCard } from '@/components/calendar/event-card';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

import { RefreshButton } from '../news/_components/refresh-button';

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
        <EmptyState
          tone="muted"
          icon={<CalendarDays className="size-7" strokeWidth={1.75} />}
          title="No events scheduled"
          description="Events refresh automatically every 15 minutes. Tap below to refresh now."
          action={<RefreshButton endpoint="/api/cron/calendar" />}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day} className="flex flex-col gap-3">
              <h2
                className="bg-bg/95 supports-[backdrop-filter]:bg-bg/70 text-fg-subtle sticky z-10 -mx-4 px-5 py-2 text-xs font-semibold uppercase tracking-wide backdrop-blur-md"
                style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
              >
                {dayLabel(day)}
              </h2>
              <ul className="flex flex-col gap-3">
                {items.map((e) => (
                  <li key={e.id} className={e.date < Date.now() ? 'opacity-60' : ''}>
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
