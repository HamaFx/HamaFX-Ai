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

// CalendarHero — countdown-to-next-high-impact + this-week pulse strip.
//
// Sits at the top of /calendar. The countdown is the most actionable
// piece of info on the page: "FOMC in 4h 22m" tells the user whether to
// stay flat for a few hours or whether they have all day. The pulse
// strip shows the distribution of upcoming impacts so the user can
// gauge how event-heavy the week is.

import type { EconomicEvent } from '@hamafx/shared';
import {IconClock, IconBolt} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { useTime } from '@/components/providers/time-provider';
import { cn } from '@/lib/cn';

interface CalendarHeroProps {
  events?: readonly EconomicEvent[];
}

export function CalendarHero({ events = [] }: CalendarHeroProps) {
  const { now } = useTime();

  // Next high-impact event in the future.
  const nextHigh = events
    .filter((e) => e.importance === 'high' && e.date > now)
    .sort((a, b) => a.date - b.date)[0];

  // Upcoming distribution — only future events, capped at 14 days.
  const upcoming = events.filter((e) => e.date > now && e.date - now < 14 * 24 * 60 * 60_000);
  const counts = {
    high: upcoming.filter((e) => e.importance === 'high').length,
    medium: upcoming.filter((e) => e.importance === 'medium').length,
    low: upcoming.filter((e) => e.importance === 'low').length,
  };
  const total = counts.high + counts.medium + counts.low || 1;
  const pct = (n: number) => (n / total) * 100;

  // Today's events — counted from local-day start.
  const today0 = startOfDay(now);
  const todayEnd = today0 + 24 * 60 * 60_000;
  const todayCount = events.filter((e) => e.date >= today0 && e.date < todayEnd).length;

  return (
    <section
      aria-label="Calendar overview"
      className="border border-border bg-bg-elev-1 rounded-sm relative flex flex-col gap-4 overflow-hidden p-4"
    >
      {/* Countdown row */}
      {nextHigh ? (
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="text-bear bg-bear/10 inline-flex size-12 shrink-0 items-center justify-center rounded-sm"
          >
            <IconBolt className="size-5" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-fg-subtle text-caption font-semibold uppercase tracking-wider">
              Next high-impact
            </p>
            <p className="text-fg truncate text-base font-bold">{nextHigh.title}</p>
            <p className="text-fg-muted flex items-center gap-1.5 text-xs tabular-nums">
              <IconClock className="size-3" />
              <Countdown ms={nextHigh.date - now} />
              <span aria-hidden className="opacity-50">·</span>
              <CountryChip country={nextHigh.country} currency={nextHigh.currency} />
            </p>
          </div>
          <Link
            href={`/chat?prompt=${encodeURIComponent(
              `What does ${nextHigh.title} mean for ${nextHigh.currency ?? 'the dollar'} and gold?`,
            )}`}
            className="text-fg-muted hover:text-fg active:bg-bg-elev-3 inline-flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors"
            aria-label="Ask AI about this event"
          >
            <IconBolt className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="text-fg-muted flex items-center gap-3 text-sm">
          <IconBolt className="text-fg-subtle size-5" />
          No high-impact events in the next 14 days.
        </div>
      )}

      {/* Distribution bar — shows the impact mix for the next two weeks */}
      <div className="flex flex-col gap-2">
        <div className="text-fg-subtle flex items-baseline justify-between text-body-sm">
          <span className="font-semibold uppercase tracking-wider">Next 14 days</span>
          <span className="tabular-nums">
            {todayCount > 0 ? `${todayCount} today · ` : ''}
            {upcoming.length} upcoming
          </span>
        </div>
        <div className="bg-bg-elev-2 flex h-1.5 w-full overflow-hidden rounded-sm">
          {counts.high > 0 ? (
            <span
              aria-hidden
              className="bg-bear h-full"
              style={{ width: `${pct(counts.high)}%` }}
            />
          ) : null}
          {counts.medium > 0 ? (
            <span
              aria-hidden
              className="bg-warn h-full"
              style={{ width: `${pct(counts.medium)}%` }}
            />
          ) : null}
          {counts.low > 0 ? (
            <span
              aria-hidden
              className="bg-fg-subtle h-full"
              style={{ width: `${pct(counts.low)}%`, opacity: 0.5 }}
            />
          ) : null}
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm tabular-nums">
          <Tag dot="bg-bear" tone="text-bear" label="High" count={counts.high} />
          <Tag dot="bg-warn" tone="text-warn" label="Medium" count={counts.medium} />
          <Tag dot="bg-fg-subtle" tone="text-fg-muted" label="Low" count={counts.low} />
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function Countdown({ ms }: { ms: number }) {
  if (ms <= 0) return <span className="text-bear font-semibold">Live now</span>;
  const d = Math.floor(ms / (24 * 60 * 60_000));
  const h = Math.floor((ms % (24 * 60 * 60_000)) / (60 * 60_000));
  const m = Math.floor((ms % (60 * 60_000)) / 60_000);
  if (d > 0) {
    return (
      <span className="text-fg font-semibold">
        in {d}d {h}h
      </span>
    );
  }
  if (h > 0) {
    return (
      <span className="text-fg font-semibold">
        in {h}h {m}m
      </span>
    );
  }
  return (
    <span className="text-warn font-semibold">
      in {m}m
    </span>
  );
}

function CountryChip({
  country,
  currency,
}: {
  country: EconomicEvent['country'];
  currency: EconomicEvent['currency'];
}) {
  const label = currency ?? country;
  return (
    <span className="bg-bg-elev-2 border border-border rounded-sm px-1.5 py-0.5 text-caption font-bold uppercase tabular-nums">
      {label}
    </span>
  );
}

function Tag({
  dot,
  tone,
  label,
  count,
}: {
  dot: string;
  tone: string;
  label: string;
  count: number;
}) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('size-2 rounded-sm', dot)} />
      <span className={cn('font-semibold', tone)}>{label}</span>
      <span className="text-fg">{count}</span>
    </li>
  );
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}


