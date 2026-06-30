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

'use client';

// Phase 1.6 — Calendar widget.
//
// Next 3 high-impact economic events with live countdowns. Uses the
// shared `useNow` provider so all tickers stay in sync without each
// widget spawning its own interval.

import Link from 'next/link';
import { Calendar } from 'lucide-react';
import type { EconomicEvent } from '@hamafx/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { useNow } from '@/components/providers/time-provider';
import { cn } from '@/lib/cn';

interface CalendarWidgetProps {
  events: readonly EconomicEvent[];
  limit?: number;
}

export function CalendarWidget({ events, limit = 3 }: CalendarWidgetProps) {
  const now = useNow().getTime();

  // Filter to upcoming high/medium importance, sort ascending, cap.
  const upcoming = events
    .filter((e) => e.date > now)
    .sort((a, b) => a.date - b.date)
    .slice(0, limit);

  return (
    <section
      aria-label="Upcoming events"
      className="border-divider bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="text-fg-subtle size-4" />
          <span className="text-fg text-body-sm font-semibold">Calendar</span>
        </div>
        <Link href="/calendar" className="text-fg-subtle hover:text-fg text-caption">
          View all
        </Link>
      </header>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={<Calendar className="size-5" />}
          title="No upcoming events"
          description="High-impact events will appear here as they're scheduled."
          tone="muted"
          bare
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col">
          {upcoming.map((e) => {
            const date = new Date(e.date);
            const importanceTone =
              e.importance === 'high'
                ? 'bg-bear/15 text-bear'
                : e.importance === 'medium'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-fg-muted/15 text-fg-muted';
            return (
              <li
                key={e.id}
                className="border-divider/40 flex items-center justify-between gap-3 border-b py-2 last:border-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-fg text-body-sm font-semibold truncate">
                    {e.title}
                  </span>
                  <span className="text-fg-subtle text-caption tabular-nums">
                    {date.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    ·{' '}
                    {date.toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {formatCountdown(e.date - now)}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-caption font-bold px-1.5 py-0.5 rounded shrink-0',
                    importanceTone,
                  )}
                >
                  {e.currency ?? e.country}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Live now';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) {
    const remMin = min % 60;
    return remMin > 0 ? `in ${hr}h ${remMin}m` : `in ${hr}h`;
  }
  const d = Math.floor(hr / 24);
  return `in ${d}d`;
}
