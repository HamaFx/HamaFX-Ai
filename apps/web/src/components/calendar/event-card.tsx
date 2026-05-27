// One calendar event row. We render compact-by-design: importance dot,
// title, currency tag, scheduled time. Forecast/actual/previous render
// only when present (FRED-only Phase 1c data has them all null).

import type { EconomicEvent } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface EventCardProps {
  event: EconomicEvent;
}

const IMPORTANCE_DOT: Record<EconomicEvent['importance'], string> = {
  high: 'bg-bear',
  medium: 'bg-warn',
  low: 'bg-fg-subtle',
};

export function EventCard({ event }: EventCardProps) {
  const date = new Date(event.date);
  const sameDay = isToday(date);

  return (
    <div className="border-border bg-bg-elev-1 flex items-start gap-3 rounded-lg border p-3">
      <span
        aria-hidden
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', IMPORTANCE_DOT[event.importance])}
        title={`${event.importance} impact`}
      />

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-snug">{event.title}</h3>

        <div className="text-fg-subtle mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums">
          {event.currency ? (
            <span className="border-border rounded border px-1 py-0.5 text-[9px] uppercase">
              {event.currency}
            </span>
          ) : null}
          <span>{event.country}</span>
          <span aria-hidden>·</span>
          <time dateTime={date.toISOString()}>
            {sameDay ? `today ${timeLabel(date)}` : `${dateLabel(date)} ${timeLabel(date)}`}
          </time>
        </div>

        {(event.actual !== null || event.forecast !== null || event.previous !== null) && (
          <dl className="text-fg-muted mt-1 flex gap-4 text-[11px] tabular-nums">
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
      <dt className="text-fg-subtle text-[10px] uppercase">{label}</dt>
      <dd className="text-fg">
        {value}
        {unit ? <span className="text-fg-subtle ml-0.5">{unit}</span> : null}
      </dd>
    </span>
  );
}

function BeatMiss({ actual, forecast }: { actual: number; forecast: number }) {
  const delta = actual - forecast;
  if (delta === 0) return null;
  const beat = delta > 0;
  return (
    <span className={cn('text-[10px] font-medium', beat ? 'text-bull' : 'text-bear')}>
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
