'use client';

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

// /calendar interactive view. Owns filter state and groups events into
// today / tomorrow / this-week / later-this-month / past sections.

import type { EconomicEvent } from '@hamafx/shared';
import { Filter, RotateCw, CalendarX } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useQueryState } from 'nuqs';

import { EventCard } from '@/components/calendar/event-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

import {
  CalendarToolbar,
  type CurrencyFilter,
  type ImportanceFilter,
} from './calendar-toolbar';

interface CalendarViewProps {
  initialEvents: EconomicEvent[];
}

const AUTO_REFRESH_MS = 5 * 60_000;

export function CalendarView({ initialEvents }: CalendarViewProps) {
  const [pending, startTransition] = useTransition();
  const [importance, setImportance] = useQueryState('importance', { defaultValue: 'all' }) as [ImportanceFilter, (val: ImportanceFilter) => void];
  const [currency, setCurrency] = useQueryState('currency', { defaultValue: 'all' }) as [CurrencyFilter, (val: CurrencyFilter) => void];
  const [showPast, setShowPast] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());

  const { data: events = initialEvents, isLoading, isError, error, refetch } = useQuery<EconomicEvent[]>({
    queryKey: ['calendar'],
    queryFn: async () => {
      const res = await fetch('/api/calendar');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as EconomicEvent[];
    },
    initialData: initialEvents,
  });

  // Soft auto-refresh — keeps countdowns/relative times accurate.
  useEffect(() => {
    const id = setInterval(() => {
      refetch();
      setLastRefreshed(Date.now());
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refetch]);

  function manualRefresh() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/cron/calendar');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success('Calendar refreshed');
        refetch();
        setLastRefreshed(Date.now());
      } catch (err) {
        toast.error('Refresh failed', {
          description: err instanceof Error ? err.message : 'Network error',
        });
      }
    });
  }

  const filtered = useMemo(() => {
    const now = Date.now();
    return events.filter((e) => {
      if (!showPast && e.date < now) return false;
      if (importance !== 'all' && e.importance !== importance) return false;
      if (currency !== 'all' && e.currency !== currency) return false;
      return true;
    });
  }, [events, importance, currency, showPast]);

  const sections = useMemo(() => bucket(filtered), [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-3 mt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-4">
        <EmptyState
          tone="muted"
          icon={<CalendarX className="size-7" />}
          title="Failed to load calendar"
          description={error instanceof Error ? error.message : 'Unknown error'}
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        importance={importance}
        onImportance={setImportance}
        currency={currency}
        onCurrency={setCurrency}
        showPast={showPast}
        onShowPast={setShowPast}
        visibleCount={filtered.length}
        totalCount={events.length}
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={manualRefresh}
          disabled={pending}
          aria-label="Refresh now"
          className="text-fg-muted hover:text-fg hover:bg-zinc-900 inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RotateCw className={cn('size-3.5', pending && 'animate-spin')} />
          {pending ? 'Refreshing…' : `Updated ${formatRelative(lastRefreshed)}`}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<Filter className="size-7" strokeWidth={1.75} />}
          title="No events match"
          description="Try a different importance or currency filter, or toggle 'Show past'."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(([label, items]) => (
            <section key={label} className="flex flex-col gap-3">
              <h2
                className="bg-zinc-950/95 text-fg-subtle sticky z-10 -mx-4 flex items-baseline gap-2 px-5 py-2 text-caption font-semibold uppercase tracking-wider"
                style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
              >
                {label}
                <span className="text-fg-subtle/60 tabular-nums">{items.length}</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {items.map((e) => (
                  <li
                    key={e.id}
                    className={e.date < Date.now() ? 'opacity-60' : ''}
                  >
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

// ---------------------------------------------------------------------------

type Section = readonly [label: string, items: EconomicEvent[]];

function bucket(events: readonly EconomicEvent[]): Section[] {
  if (events.length === 0) return [];
  const now = Date.now();
  const today0 = startOfDay(now);
  const tomorrow0 = today0 + 24 * 60 * 60_000;
  const dayAfter0 = tomorrow0 + 24 * 60 * 60_000;
  const weekEnd = today0 + 7 * 24 * 60 * 60_000;

  const past: EconomicEvent[] = [];
  const today: EconomicEvent[] = [];
  const tomorrow: EconomicEvent[] = [];
  const week: EconomicEvent[] = [];
  const later: EconomicEvent[] = [];

  for (const e of events) {
    if (e.date < today0) past.push(e);
    else if (e.date < tomorrow0) today.push(e);
    else if (e.date < dayAfter0) tomorrow.push(e);
    else if (e.date < weekEnd) week.push(e);
    else later.push(e);
  }

  const sections: Section[] = [];
  // Today first so the user lands on what's actionable.
  if (today.length) sections.push(['Today', today]);
  if (tomorrow.length) sections.push(['Tomorrow', tomorrow]);
  if (week.length) sections.push(['Later this week', week]);
  if (later.length) sections.push(['Later', later]);
  if (past.length) sections.push(['Past', past]);
  return sections;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
