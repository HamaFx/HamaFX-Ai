'use client';

// Calendar event card — premium, scannable, action-rich.
//
// Layout:
//
//   ┌────────────────────────────────────────┐
//   │ [▲]  USD · United States · 14:30 EST   │  meta strip
//   │      in 4h 22m                          │  countdown
//   │                                         │
//   │ Big title (clamped 2)                   │  text-base, semibold
//   │                                         │
//   │ Forecast 0.3 · Prev 0.2 · Actual —      │  data row
//   │                                         │
//   │ ✦ Ask AI · 🔔 Remind me                │  action row (when future)
//   └────────────────────────────────────────┘
//
// Vertical accent ribbon on the left encodes importance: red = high,
// amber = medium, neutral = low. Same scannability cue as the news cards.

import type { EconomicEvent } from '@hamafx/shared';
import { Bell, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';

interface EventCardProps {
  event: EconomicEvent;
}

const IMPORTANCE: Record<
  EconomicEvent['importance'],
  { ribbon: string; label: string; glyph: string; chipBg: string; chipText: string }
> = {
  high: {
    ribbon: 'oklch(70% 0.22 25)',
    label: 'High impact',
    glyph: '▲',
    chipBg: 'bg-bear/10 ring-bear/30',
    chipText: 'text-bear',
  },
  medium: {
    ribbon: 'oklch(82% 0.14 80)',
    label: 'Medium impact',
    glyph: '■',
    chipBg: 'bg-warn/10 ring-warn/30',
    chipText: 'text-warn',
  },
  low: {
    ribbon: 'oklch(28% 0 0)',
    label: 'Low impact',
    glyph: '•',
    chipBg: 'bg-bg-elev-2 ring-divider',
    chipText: 'text-fg-subtle',
  },
};

export function EventCard({ event }: EventCardProps) {
  const now = useNowTick();
  const date = new Date(event.date);
  const importance = IMPORTANCE[event.importance];
  const isFuture = event.date > now;
  const isImminent = isFuture && event.date - now < 60 * 60_000;

  const askPrompt = encodeURIComponent(
    `What does ${event.title} (${event.currency ?? event.country}) at ${date.toUTCString()} usually mean for ${event.currency ?? 'USD'} and gold?`,
  );

  return (
    <article
      className={cn(
        'card-premium relative overflow-hidden transition-colors duration-200',
        isImminent && 'ring-warn/30 ring-1',
      )}
    >
      {/* Importance ribbon */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: importance.ribbon }}
      />

      <div className="flex flex-col gap-3 px-4 py-3.5 pl-5">
        {/* Meta strip */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tabular-nums">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-bold uppercase ring-1',
              importance.chipBg,
              importance.chipText,
            )}
            title={importance.label}
          >
            <span aria-hidden>{importance.glyph}</span>
            <span className="sr-only">{importance.label}</span>
            {event.currency ?? event.country}
          </span>
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
        <h3 className="text-fg line-clamp-2 text-[15px] font-semibold leading-snug">
          {event.title}
        </h3>

        {/* Numbers — actual / forecast / previous in proper data hierarchy */}
        {(event.actual !== null || event.forecast !== null || event.previous !== null) && (
          <DataRow event={event} />
        )}
      </div>

      {/* Action row — only render when it would be useful */}
      {isFuture ? (
        <div className="border-divider/60 flex items-center justify-between gap-2 border-t px-3 py-2">
          <Link
            href={`/chat?prompt=${askPrompt}`}
            className="text-fg-muted hover:text-brand inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
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
    <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] tabular-nums">
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
            'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1',
            beat === 'beat'
              ? 'bg-bull/15 text-bull ring-bull/30'
              : 'bg-bear/15 text-bear ring-bear/30',
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
      <dt className="text-fg-subtle text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className={cn('font-semibold', emphasis ? 'text-fg' : 'text-fg-muted')}>
        {value}
        {unit ? <span className="text-fg-subtle ml-0.5 font-normal">{unit}</span> : null}
      </dd>
    </span>
  );
}

function beatMiss(event: EconomicEvent): 'beat' | 'miss' | null {
  if (event.actual === null || event.forecast === null) return null;
  const delta = event.actual - event.forecast;
  if (delta === 0) return null;
  return delta > 0 ? 'beat' : 'miss';
}

function Countdown({ ms, imminent }: { ms: number; imminent: boolean }) {
  if (ms <= 0) return <span className="text-bear font-semibold">Live now</span>;
  const d = Math.floor(ms / (24 * 60 * 60_000));
  const h = Math.floor((ms % (24 * 60 * 60_000)) / (60 * 60_000));
  const m = Math.floor((ms % (60 * 60_000)) / 60_000);
  const text =
    d > 0 ? `in ${d}d ${h}h` : h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  return (
    <span
      className={cn('font-semibold', imminent ? 'text-warn' : 'text-fg')}
    >
      {text}
    </span>
  );
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function useNowTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// Local "Remind me" using the Notifications API. Personal app, no server
// reminders queue — but a one-shot setTimeout fires a system notification
// 5 minutes before the event so the user has time to flatten / sit out.

function RemindButton({ event }: { event: EconomicEvent }) {
  const [armed, setArmed] = useState(false);

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
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
        armed
          ? 'text-brand bg-brand/10'
          : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
      )}
    >
      <Bell className={cn('size-3.5', armed && 'fill-current')} />
      {armed ? 'Reminded' : 'Remind me'}
    </button>
  );
}
