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

// Bespoke renderer for the `get_calendar` tool part.
//
// Renders up to the first 10 calendar items as a compact, scannable list. Each
// row deep-links to `/calendar?id=<item.id>` so the user can jump from chat
// straight to the dedicated calendar surface for that event. Numeric columns
// use `.tabular-nums` so digits align across rows; impact is colour-coded via
// semantic tokens (`text-bear` / `text-warn` / `text-fg-muted`).
//
// Server component on purpose — purely presentational, no state or events.

import type { GetCalendarOutput, ToolCalendarItem } from '@hamafx/shared';

interface GetCalendarPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: GetCalendarOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

const MAX_ROWS = 10;

const IMPACT_TEXT: Record<ToolCalendarItem['importance'], string> = {
  high: 'text-bear',
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
    return <CalendarError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <CalendarSkeleton />;
  }

  if (output.pipelinePending) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-lg border p-3 text-sm">
        Calendar pipeline hasn&apos;t populated the DB yet. Trigger the{' '}
        <code className="bg-bg-elev-2 rounded px-1 py-0.5 text-caption">/api/cron/calendar</code>{' '}
        cron once and try again.
      </div>
    );
  }

  const items = output.items.slice(0, MAX_ROWS);

  if (items.length === 0) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-lg border p-3 text-sm">
        No calendar events in the requested window.
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border">
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <CalendarRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarRow({ item }: { item: ToolCalendarItem }) {
  const iso = new Date(item.date).toISOString();
  const tag = item.currency ?? item.country;

  return (
    <a
      href={`/calendar?id=${encodeURIComponent(item.id)}`}
      className="focus-visible:ring-fg-muted hover:bg-bg-elev-2 flex min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
    >
      <time dateTime={iso} className="text-fg-muted w-12 shrink-0 text-xs tabular-nums">
        {formatHHmmUtc(item.date)}
      </time>

      <span className="border-border text-fg-muted shrink-0 rounded border px-1 py-0.5 text-[9px] uppercase tabular-nums">
        {tag}
      </span>

      <span className="text-fg min-w-0 flex-1 truncate font-medium">{item.title}</span>

      <span
        className={`shrink-0 text-caption uppercase ${IMPACT_TEXT[item.importance]}`}
        title={`${item.importance} impact`}
      >
        {IMPACT_LABEL[item.importance]}
      </span>

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
    </a>
  );
}

function CalendarSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border"
      aria-busy="true"
      aria-label="Loading calendar"
    >
      <ul className="divide-border divide-y">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex min-h-[44px] items-center gap-2.5 px-3 py-2">
            <span className="bg-bg-elev-2 h-3 w-12 animate-pulse rounded" />
            <span className="bg-bg-elev-2 h-3 w-10 animate-pulse rounded" />
            <span className="bg-bg-elev-2 h-3 flex-1 animate-pulse rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalendarError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Calendar unavailable{message ? ` · ${message}` : ''}
    </div>
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
