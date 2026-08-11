// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `get_calendar` tool part.
//
// Renders up to the first 10 calendar items as a compact, scannable list. Each
// row deep-links to `/calendar?id=<item.id>` so the user can jump from chat
// straight to the dedicated calendar surface for that event. Numeric columns
// use `.tabular-nums` so digits align across rows; impact is colour-coded via
// semantic tokens (`text-danger` / `text-warn` / `text-fg-muted`).
//
// Server component on purpose — purely presentational, no state or events.

import Link from 'next/link';
import { IconAlertTriangle, IconCalendarEvent } from '@tabler/icons-react';
import type { GetCalendarOutput, ToolCalendarItem } from '@kestrel/shared';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GetCalendarPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetCalendarOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

const MAX_ROWS = 10;

const IMPACT_TEXT: Record<ToolCalendarItem['importance'], string> = {
  high: 'text-danger',
  medium: 'text-warn',
  low: 'text-fg-muted',
};

const IMPACT_LABEL: Record<ToolCalendarItem['importance'], string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
};

export function GetCalendarPart({ output, state, errorMessage }: GetCalendarPartProps) {
  if (state === 'error') {
    return <CalendarError message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <CalendarSkeleton />;
  }

  if (output.pipelinePending) {
    return (
      <Card as="section" aria-label="Calendar status" className="p-3 text-body-sm">
        <p className="text-fg-muted flex items-start gap-2"><IconCalendarEvent className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Calendar pipeline hasn&apos;t populated the DB yet. Trigger the <code className="bg-bg-elev-2 rounded-sm px-1 py-0.5 text-caption">/api/cron/calendar</code> cron once and try again.</p>
      </Card>
    );
  }

  const items = output.items.slice(0, MAX_ROWS);

  if (items.length === 0) {
    return (
      <Card as="section" aria-label="Calendar status" className="p-3 text-body-sm">
        <p className="text-fg-muted flex items-center gap-2"><IconCalendarEvent className="size-4" aria-hidden="true" /> No calendar events in the requested window.</p>
      </Card>
    );
  }

  return (
    <Card as="section" aria-label={`Calendar results: ${items.length} events`} className="p-0">
      <header className="flex items-center justify-between gap-2 border-b border-divider px-3 py-3">
        <div className="flex items-center gap-2"><IconCalendarEvent className="text-fg-subtle size-4" aria-hidden="true" /><h3 className="text-fg text-body-sm font-semibold">Economic calendar</h3></div>
        <Badge tone="neutral">{items.length} event{items.length === 1 ? '' : 's'}</Badge>
      </header>
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <CalendarRow item={item} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CalendarRow({ item }: { item: ToolCalendarItem }) {
  const iso = new Date(item.date).toISOString();
  const tag = item.currency ?? item.country;

  return (
    <Link
      href={`/calendar?id=${encodeURIComponent(item.id)}`}
      className="focus-visible:ring-fg-muted hover:bg-bg-elev-2 flex min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
    >
      <time dateTime={iso} className="text-fg-muted w-12 shrink-0 text-xs tabular-nums">
        {formatHHmmUtc(item.date)}
      </time>

      <span className="border-border text-fg-muted shrink-0 rounded-sm border px-1 py-0.5 text-xs uppercase tabular-nums">
        {tag}
      </span>

      <span className="text-fg min-w-0 flex-1 truncate font-medium">{item.title}</span>

      <Badge
        tone={item.importance === 'high' ? 'danger' : item.importance === 'medium' ? 'warn' : 'neutral'}
        className={`shrink-0 ${IMPACT_TEXT[item.importance]}`}
      >
        {IMPACT_LABEL[item.importance]}
      </Badge>

      {(item.forecast !== null || item.previous !== null) && (
        <span className="text-fg-muted hidden shrink-0 items-baseline gap-2 text-xs tabular-nums sm:flex">
          {item.forecast !== null && (
            <span className="text-fg tabular-nums">
              {formatNumber(item.forecast)}
              {item.unit ? <span className="text-fg-muted ml-0.5">{item.unit}</span> : null}
            </span>
          )}
          {item.previous !== null && (
            <span className="text-fg-muted tabular-nums">
              {formatNumber(item.previous)}
              {item.unit ? <span className="ml-0.5">{item.unit}</span> : null}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

function CalendarSkeleton() {
  return (
    <Card
      as="section"
      role="status"
      className="p-0"
      aria-busy="true"
      aria-label="Loading calendar"
    >
      <ul className="divide-border divide-y">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center gap-2.5 px-3 py-2">
            <span className="bg-bg-elev-2 h-3 w-12 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-3 w-10 animate-pulse rounded-sm" />
            <span className="bg-bg-elev-2 h-3 flex-1 animate-pulse rounded-sm" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CalendarError({ message }: { message?: string }) {
  return (
    <Card as="section" role="alert" aria-label={message ? `Calendar unavailable: ${message}` : 'Calendar unavailable'} className="border-danger/30 p-3 text-sm">
      <p className="text-danger flex items-start gap-2"><IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span><span className="font-semibold">Calendar unavailable</span>{message ? <span className="text-fg-muted"> · {message}</span> : null}</span></p>
    </Card>
  );
}

function formatHHmmUtc(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--:--';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatNumber(n: number): string {
  // Light touch — let the browser pick a sensible representation but keep
  // small integers small (e.g. "3.2", "245000"). The schema doesn't carry
  // precision so we don't pretend to know it.
  if (Number.isInteger(n)) return n.toString();
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return n.toFixed(decimals);
}
