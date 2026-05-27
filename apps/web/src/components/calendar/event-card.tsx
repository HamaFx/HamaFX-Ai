// Calendar event — premium glass card with importance dot, currency
// chip, animated pulse for imminent events.

import type { EconomicEvent } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface EventCardProps {
  event: EconomicEvent;
}

const IMPORTANCE_DOT: Record<EconomicEvent['importance'], string> = {
  high: 'bg-bear shadow-[0_0_12px_oklch(68%_0.24_25_/_0.6)]',
  medium: 'bg-warn shadow-[0_0_8px_oklch(80%_0.16_80_/_0.5)]',
  low: 'bg-fg-subtle',
};

export function EventCard({ event }: EventCardProps) {
  const date = new Date(event.date);
  const sameDay = isToday(date);

  return (
    <div className="card-premium flex items-start gap-3 p-3.5">
      <span className="relative mt-1.5 inline-flex h-3 w-3 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={cn(
            'relative h-2 w-2 rounded-full',
            IMPORTANCE_DOT[event.importance],
          )}
          title={`${event.importance} impact`}
        />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="text-fg text-sm font-semibold leading-snug">{event.title}</h3>

        <div className="text-fg-subtle mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] tabular-nums">
          {event.currency ? (
            <span className="bg-bg-elev-2 text-fg-muted ring-divider rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ring-1">
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
          <dl className="text-fg-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
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
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
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
