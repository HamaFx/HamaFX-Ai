// Calendar event — premium glass card with importance dot, currency
// chip, animated pulse for imminent events.
//
// Mobile-first geometry: card padding p-4 (16), gap-3 (12) between dot and
// content, gap-2 (8) between title and meta. Importance dot is a 16×16
// disc with the ▲/■/• glyph centered inside, replacing the previous
// fragile dot-plus-absolute-symbol composition.

import type { EconomicEvent } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface EventCardProps {
  event: EconomicEvent;
}

const IMPORTANCE: Record<
  EconomicEvent['importance'],
  { ring: string; dot: string; symbol: string; label: string; symbolColor: string }
> = {
  high: {
    ring: 'ring-bear/30',
    dot: 'bg-bear/15',
    symbolColor: 'text-bear',
    symbol: '▲',
    label: 'High impact',
  },
  medium: {
    ring: 'ring-warn/30',
    dot: 'bg-warn/15',
    symbolColor: 'text-warn',
    symbol: '■',
    label: 'Medium impact',
  },
  low: {
    ring: 'ring-divider',
    dot: 'bg-bg-elev-2',
    symbolColor: 'text-fg-subtle',
    symbol: '•',
    label: 'Low impact',
  },
};

export function EventCard({ event }: EventCardProps) {
  const date = new Date(event.date);
  const sameDay = isToday(date);
  const importance = IMPORTANCE[event.importance];

  return (
    <div className="card-premium flex items-start gap-3 p-4">
      <span
        className={cn(
          'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full ring-1',
          importance.ring,
          importance.dot,
        )}
        title={importance.label}
      >
        <span aria-hidden className={cn('text-[10px] leading-none', importance.symbolColor)}>
          {importance.symbol}
        </span>
        <span className="sr-only">{importance.label}</span>
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="text-fg text-sm font-semibold leading-snug">{event.title}</h3>

        <div className="text-fg-subtle mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
          {event.currency ? (
            <span className="bg-bg-elev-2 text-fg-muted ring-divider rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ring-1">
              {event.currency}
            </span>
          ) : null}
          <span className="font-medium">{event.country}</span>
          <span aria-hidden className="opacity-50">·</span>
          <time dateTime={date.toISOString()}>
            {sameDay ? `today ${timeLabel(date)}` : `${dateLabel(date)} ${timeLabel(date)}`}
          </time>
        </div>

        {(event.actual !== null || event.forecast !== null || event.previous !== null) && (
          <dl className="text-fg-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
            {event.actual !== null && (
              <Stat label="actual" value={event.actual} unit={event.unit} />
            )}
            {event.forecast !== null && (
              <Stat label="forecast" value={event.forecast} unit={event.unit} />
            )}
            {event.actual !== null && event.forecast !== null && (
              <BeatMiss actual={event.actual} forecast={event.forecast} />
            )}
            {event.previous !== null && (
              <Stat label="prev" value={event.previous} unit={event.unit} />
            )}
          </dl>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string | null }) {
  return (
    <span className="flex items-baseline gap-1">
      <dt className="text-fg-subtle text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="text-fg font-semibold">
        {value}
        {unit ? <span className="text-fg-subtle ml-0.5 font-normal">{unit}</span> : null}
      </dd>
    </span>
  );
}

function BeatMiss({ actual, forecast }: { actual: number; forecast: number }) {
  const delta = actual - forecast;
  if (delta === 0) return null;
  const beat = delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
        beat ? 'bg-bull/15 text-bull ring-bull/30' : 'bg-bear/15 text-bear ring-bear/30',
      )}
    >
      {beat ? '▲ beat' : '▼ miss'}
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
function dateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
