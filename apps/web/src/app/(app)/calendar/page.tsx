// /calendar — server-rendered list of upcoming/recent macro events.
// FRED-only in Phase 1c; the schema has placeholders for actual / forecast /
// previous which a future cron will populate from /fred/series/observations.

import { listUpcomingEvents } from '@hamafx/ai';
import type { EconomicEvent } from '@hamafx/shared';
import type { Metadata } from 'next';

import { EventCard } from '@/components/calendar/event-card';
import { PageHeader } from '@/components/layout/page-header';

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
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day} className="flex flex-col gap-2">
              <h2
                className="bg-bg/95 supports-[backdrop-filter]:bg-bg/70 text-fg-subtle sticky z-10 -mx-4 px-5 py-2 text-xs font-medium uppercase tracking-wide backdrop-blur-md"
                style={{ top: 'calc(48px + env(safe-area-inset-top))' }}
              >
                {dayLabel(day)}
              </h2>
              <ul className="flex flex-col gap-2">
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

function EmptyState() {
  return (
    <div className="card-premium flex flex-col items-center gap-4 p-10 text-center">
      <span
        className="text-fg-subtle inline-flex h-16 w-16 items-center justify-center rounded-3xl"
        style={{ background: 'oklch(70% 0.02 265 / 0.1)' }}
      >
        <svg
          className="size-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-fg text-base font-semibold">No events scheduled</p>
        <p className="text-fg-muted text-sm">
          The cron fires every 15 minutes. Tap below to trigger manually.
        </p>
      </div>
      <RefreshButton endpoint="/api/cron/calendar" />
    </div>
  );
}
