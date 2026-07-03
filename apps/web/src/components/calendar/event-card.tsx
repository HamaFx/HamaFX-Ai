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

// Calendar event card — data-first, scannable at a glance.
//
// Layout:
//
//   ┌────────────────────────────────────────┐
//   │ [USD] · United States · 14:30 EST      │  meta strip (currency + country + time)
//   │         in 4h 22m                       │  countdown (future) or "released" (past)
//   │                                         │
//   │ Big title (clamped 2)                   │  text-body, semibold
//   │                                         │
//   │ actual 0.3 · forecast 0.2 · prev 0.2    │  data row (only when present)
//   │                                         │
//   │              [Ask AI]  [Remind me]      │  hover-reveal actions (always-visible on touch)
//   └────────────────────────────────────────┘
//
// Vertical accent ribbon on the left encodes importance: red = high,
// amber = medium, low = no ribbon (only shown when paired with a
// contrasting surface tone). Same scannability cue as the news cards.
//
// Per PLAN.md §2.4 + §2.6 — sharpen radii, adopt R1 typography tokens,
// kill the ring-1 chip pattern, surface-align with ArticleCard refactor
// (commit 1992755) so news and calendar read as one design system.

import type { EconomicEvent } from '@hamafx/shared';
import { Bell, Sparkles } from 'lucide-react';
import { Link } from 'next-view-transitions';
import { useState } from 'react';
import { toast } from 'sonner';

import { useTime } from '@/components/providers/time-provider';
import { cn } from '@/lib/cn';

interface EventCardProps {
  event: EconomicEvent;
}

const IMPORTANCE = {
  high: {
    ribbon: '#EF4444',
    label: 'High impact',
    glyph: '▲',
  },
  medium: {
    ribbon: 'oklch(82% 0.14 80)',
    label: 'Medium impact',
    glyph: '■',
  },
  low: {
    ribbon: 'transparent',
    label: 'Low impact',
    glyph: '•',
  },
} as const satisfies Record<
  EconomicEvent['importance'],
  { ribbon: string; label: string; glyph: string }
>;

export function EventCard({ event }: EventCardProps) {
  const { now } = useTime();
  const date = new Date(event.date);
  const importance = IMPORTANCE[event.importance];
  const isFuture = event.date > now;
  const isImminent = isFuture && event.date - now < 60 * 60_000;
  const hasRibbon = event.importance !== 'low';

  const askPrompt = encodeURIComponent(
    `What does ${event.title} (${event.currency ?? event.country}) at ${date.toUTCString()} usually mean for ${event.currency ?? 'USD'} and gold?`,
  );

  const overlayVisibility =
    'opacity-0 transition-opacity duration-150 ' +
    'group-hover:pointer-events-auto group-hover:opacity-100 ' +
    'group-focus-within:pointer-events-auto group-focus-within:opacity-100 ' +
    '[@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto';

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-sm',
        'border border-zinc-800 bg-bg-elev-1',
        'transition-colors duration-200 md:hover:bg-zinc-900',
        isImminent && 'border-warn/40',
      )}
    >
      {/* Importance ribbon — suppressed for low-importance events; the
       * subdued bg-elev-1 surface already conveys "less prominent". */}
      {hasRibbon ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: importance.ribbon }}
        />
      ) : null}

      <div className="flex flex-col gap-2.5 px-4 py-3.5 pl-5">
        {/* Meta strip — currency glyph + country + time + countdown */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm tabular-nums">
          <span
            className="text-fg font-bold uppercase tabular-nums"
            title={importance.label}
            aria-label={importance.label}
          >
            <span aria-hidden className="mr-1">
              {importance.glyph}
            </span>
            {event.currency ?? event.country}
          </span>
          <span aria-hidden className="text-fg-subtle opacity-50">·</span>
          <span className="text-fg-muted">{event.country}</span>
          <span aria-hidden className="text-fg-subtle opacity-50">·</span>
          <time dateTime={date.toISOString()} className="text-fg-muted">
            {timeLabel(date)}
          </time>
          {isFuture ? (
            <>
              <span aria-hidden className="text-fg-subtle opacity-50">·</span>
              <Countdown ms={event.date - now} imminent={isImminent} />
            </>
          ) : event.actual !== null ? (
            <>
              <span aria-hidden className="text-fg-subtle opacity-50">·</span>
              <span className="text-fg-subtle">released</span>
            </>
          ) : null}
        </div>

        {/* Title */}
        <h3 className="text-fg line-clamp-2 text-body font-semibold leading-snug">
          {event.title}
        </h3>

        {/* Data row — actual / forecast / previous + beat/miss */}
        {(event.actual !== null || event.forecast !== null || event.previous !== null) && (
          <DataRow event={event} />
        )}
      </div>

      {/* Action overlay — hover/focus on pointer devices, always visible on
       * touch. Sits over the bottom of the card so it doesn't push content. */}
      {isFuture ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0',
            'flex items-center justify-between gap-1 px-3 pb-2',
            overlayVisibility,
          )}
        >
          <Link
            href={`/chat?prompt=${askPrompt}`}
            className="bg-zinc-900 text-fg-muted hover:text-fg pointer-events-auto inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-body-sm font-medium transition-colors"
          >
            <Sparkles className="size-3.5" />
            Ask AI
          </Link>
          <RemindButton event={event} />
        </div>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------

function DataRow({ event }: { event: EconomicEvent }) {
  const beat = beatMiss(event);
  return (
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm tabular-nums">
      {event.actual !== null && (
        <Stat label="actual" value={event.actual} unit={event.unit} emphasis />
      )}
      {event.forecast !== null && (
        <Stat label="forecast" value={event.forecast} unit={event.unit} />
      )}
      {event.previous !== null && (
        <Stat label="prev" value={event.previous} unit={event.unit} />
      )}
      {beat ? (
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 px-1.5 text-caption font-bold uppercase tabular-nums',
            beat === 'beat' ? 'text-bull' : 'text-bear',
          )}
        >
          {beat === 'beat' ? '▲ beat' : '▼ miss'}
        </span>
      ) : null}
    </dl>
  );
}

function Stat({
  label,
  value,
  unit,
  emphasis,
}: {
  label: string;
  value: number;
  unit: string | null;
  emphasis?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1">
      <dt className="text-fg-subtle text-caption uppercase tracking-wide">
        {label}
      </dt>
      <dd className={cn('font-semibold', emphasis ? 'text-fg' : 'text-fg-muted')}>
        {value}
        {unit ? (
          <span className="text-fg-subtle ml-0.5 font-normal">{unit}</span>
        ) : null}
      </dd>
    </span>
  );
}

function beatMiss(event: EconomicEvent): 'beat' | 'miss' | null {
  if (event.actual === null || event.forecast === null) return null;
  const delta = event.actual - event.forecast;
  if (delta === 0) return null;
  const isSignificant = event.forecast !== 0
    ? Math.abs(delta) / Math.abs(event.forecast) > 0.01
    : Math.abs(delta) > 0.01;
  if (!isSignificant) return null;
  return delta > 0 ? 'beat' : 'miss';
}

function Countdown({ ms, imminent }: { ms: number; imminent: boolean }) {
  if (ms <= 0) return <span className="text-red-500 font-semibold">Live now</span>;
  const d = Math.floor(ms / (24 * 60 * 60_000));
  const h = Math.floor((ms % (24 * 60 * 60_000)) / (60 * 60_000));
  const m = Math.floor((ms % (60 * 60_000)) / 60_000);
  const text =
    d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  return (
    <span className={cn('font-semibold', imminent ? 'text-warn' : 'text-fg')}>
      {text}
    </span>
  );
}

function timeLabel(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// ---------------------------------------------------------------------------
// Local "Remind me" using the Notifications API. Personal app, no server
// reminders queue — but a one-shot setTimeout fires a system notification
// 5 minutes before the event so the user has time to flatten / sit out.

const reminderSet = new Set<string>();

function RemindButton({ event }: { event: EconomicEvent }) {
  const [armed, setArmed] = useState(() => reminderSet.has(`cal-${event.id}`));

  async function arm() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Notifications unsupported on this device');
      return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      toast.error('Notifications denied', {
        description: 'Enable notifications in your browser settings to set reminders.',
      });
      return;
    }

    const fireAt = event.date - 5 * 60_000;
    const ms = fireAt - Date.now();
    if (ms <= 0) {
      toast.error('Too close to the event for a 5-minute reminder');
      return;
    }
    setArmed(true);
    reminderSet.add(`cal-${event.id}`);
    toast.success('Reminder set', {
      description: `5 minutes before ${event.title}`,
    });
    window.setTimeout(() => {
      try {
        new Notification(event.title, {
          body: `${event.country} · ${timeLabel(new Date(event.date))} — in 5 minutes`,
          icon: '/icons/icon-192.png',
          tag: `cal-${event.id}`,
        });
      } catch {
        /* tab gone */
      }
    }, ms);
  }

  return (
    <button
      type="button"
      onClick={arm}
      disabled={armed}
      aria-pressed={armed}
      className={cn(
        'pointer-events-auto inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-body-sm font-medium transition-colors',
        armed
          ? 'text-fg bg-zinc-900'
          : 'text-fg-muted hover:text-fg bg-bg-elev-2',
      )}
    >
      <Bell className={cn('size-3.5', armed && 'fill-current')} />
      {armed ? 'Reminded' : 'Remind me'}
    </button>
  );
}
