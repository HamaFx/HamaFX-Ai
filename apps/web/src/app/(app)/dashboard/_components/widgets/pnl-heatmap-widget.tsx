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

// Phase 1.8 — P&L calendar heatmap.
//
// TradeZella-style grid of daily realized R. Each closed day is coloured
// green/red by the sum of `rMultiple` for trades that closed on that local
// day; opacity scales with magnitude. Days with no closed trades are
// `bg-bg-elev-2`. Clicking a day opens a Drawer listing the trades that
// closed that day (reuse the journal EntryList pattern, but filtered).
//
// Pure client component — receives entries as props (the dashboard page
// already does the `Promise.all` fetch).

import { useMemo, useState } from 'react';
import {IconChevronLeft, IconChevronRight} from '@tabler/icons-react';
import type { JournalEntry } from '@hamafx/shared';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { EntryList } from '@/app/(app)/journal/_components/entry-list';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

interface PnLHeatmapWidgetProps {
  entries: readonly JournalEntry[];
}

interface DayBucket {
  /** YYYY-MM-DD in local time. */
  key: string;
  /** Day-of-month (1..31). */
  day: number;
  /** Sum of rMultiple for trades closed on this day (closed only). */
  totalR: number;
  /** Number of trades closed on this day. */
  count: number;
  /** The original entries — for the click-through drawer. */
  entries: JournalEntry[];
}

/** Map totalR to a semantic background style (bull/bear + alpha).
 * Uses CSS custom properties with opacity for wide browser support. */
function heatCellStyle(totalR: number): React.CSSProperties {
  if (totalR === 0) return { backgroundColor: 'var(--color-bg-elev-2)' };
  const alpha = Math.max(0.15, Math.min(0.85, Math.abs(totalR) / 5));
  const colorVar = totalR > 0 ? 'var(--color-bull)' : 'var(--color-bear)';
  return { backgroundColor: colorVar, opacity: alpha };
}

/** YYYY-MM-DD in local time. Avoids UTC drift confusing the user. */
function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PnLHeatmapWidget({ entries }: PnLHeatmapWidgetProps) {
  // The heatmap shows two months — the previous and the current one —
  // so users can compare. Anchor state is the first day of the *older*
  // month being displayed.
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d;
  });

  // Selected day → opens the Drawer with that day's trades.
  const [selectedDay, setSelectedDay] = useState<DayBucket | null>(null);

  // Group closed entries by local day.
  const bucketsByKey = useMemo(() => {
    const map = new Map<string, DayBucket>();
    for (const e of entries) {
      if (e.outcome === 'open') continue;
      if (!e.closedAt) continue;
      const key = localDayKey(e.closedAt);
      const existing = map.get(key);
      if (existing) {
        existing.totalR += e.rMultiple ?? 0;
        existing.count += 1;
        existing.entries.push(e);
      } else {
        map.set(key, {
          key,
          day: new Date(e.closedAt).getDate(),
          totalR: e.rMultiple ?? 0,
          count: 1,
          entries: [e],
        });
      }
    }
    return map;
  }, [entries]);

  // Build two stacked 6×7 calendar grids (current + previous month).
  const months = useMemo(() => {
    const result: Array<{
      label: string;
      weeks: Array<Array<DayBucket | null>>;
    }> = [];
    for (let m = 0; m < 2; m++) {
      const ref = new Date(anchor);
      ref.setMonth(anchor.getMonth() + m);
      const year = ref.getFullYear();
      const month = ref.getMonth();
      const firstOfMonth = new Date(year, month, 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // ISO weekday: Mon=0 … Sun=6.
      const firstDow = (firstOfMonth.getDay() + 6) % 7;

      const cells: Array<DayBucket | null> = [];
      // Leading blanks
      for (let i = 0; i < firstDow; i++) cells.push(null);
      // Day cells
      for (let d = 1; d <= daysInMonth; d++) {
        const ts = new Date(year, month, d).getTime();
        const key = localDayKey(ts);
        cells.push(bucketsByKey.get(key) ?? null);
      }
      // Pad to multiple of 7
      while (cells.length % 7 !== 0) cells.push(null);

      const weeks: Array<Array<DayBucket | null>> = [];
      for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
      }

      result.push({
        label: ref.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
        weeks,
      });
    }
    return result;
  }, [anchor, bucketsByKey]);

  // Summary stats for the visible window only — matches what the user sees.
  const totals = useMemo(() => {
    let r = 0;
    let count = 0;
    for (const [, b] of bucketsByKey) {
      // Only include buckets within the two visible months.
      const visible = months.some((m) =>
        m.weeks.flat().some((cell) => cell?.key === b.key),
      );
      if (!visible) continue;
      r += b.totalR;
      count += b.count;
    }
    return { r, count };
  }, [bucketsByKey, months]);

  function shiftMonth(delta: number) {
    setAnchor((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + delta);
      return next;
    });
  }

  return (
    <section
      role="img"
      aria-label={`P&L heatmap. ${totals.count} trades, total ${totals.r >= 0 ? '+' : ''}${totals.r.toFixed(1)}R`}
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-fg text-body-sm font-semibold">P&L heatmap</span>
          <span className="text-fg-subtle text-caption tabular-nums">
            {totals.count} trades · {totals.r >= 0 ? '+' : ''}
            {totals.r.toFixed(1)}R
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="text-fg-subtle hover:text-fg inline-flex size-7 items-center justify-center rounded-sm"
          >
            <IconChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="text-fg-subtle hover:text-fg inline-flex size-7 items-center justify-center rounded-sm"
          >
            <IconChevronRight className="size-4" />
          </button>
        </div>
      </header>

      {months.map((m, mi) => (
        <div key={mi} className="flex flex-col gap-2">
          <span className="text-fg text-body-sm font-semibold">{m.label}</span>

          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1.5">
            {DOW_LABELS.map((d) => (
              <span
                key={d}
                className="text-fg-subtle text-caption uppercase tracking-wider"
              >
                {d}
              </span>
            ))}
          </div>

          {/* IconCalendar grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {m.weeks.flat().map((cell, idx) => {
              if (!cell) {
                return <div key={idx} aria-hidden="true" />;
              }
              const sign = cell.totalR > 0 ? '+' : '';
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell)}
                  title={`${cell.key}: ${sign}${cell.totalR.toFixed(1)}R (${cell.count} trades)`}
                  aria-label={`${cell.key}: ${sign}${cell.totalR.toFixed(1)}R, ${cell.count} trades`}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-sm tabular-nums',
                    'text-caption',
                    cell.totalR > 0 && 'text-bull',
                    cell.totalR < 0 && 'text-bear',
                    cell.totalR === 0 && 'text-fg-muted',
                    'transition-transform active:scale-95',
                  )}
                  style={heatCellStyle(cell.totalR)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Legend />

      {/* Trade list drawer for the selected day */}
      <Drawer
        open={!!selectedDay}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        <DrawerContent>
          {selectedDay ? (
            <>
              <DrawerHeader>
                <DrawerTitle>
                  {selectedDay.count} trade{selectedDay.count === 1 ? '' : 's'} ·{' '}
                  {selectedDay.totalR >= 0 ? '+' : ''}
                  {selectedDay.totalR.toFixed(1)}R
                </DrawerTitle>
                <DrawerDescription>
                  {new Date(selectedDay.key).toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                  {selectedDay.entries[0]?.closedAt
                    ? ` · closed ${formatRelative(selectedDay.entries[0].closedAt)}`
                    : null}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <EntryList
                  entries={selectedDay.entries}
                  onClosed={() => setSelectedDay(null)}
                  onDeleted={() => setSelectedDay(null)}
                />
              </div>
              <div className="border-border border-t p-3">
                <DrawerClose className="text-fg-muted hover:text-fg text-body-sm w-full text-center">
                  Close
                </DrawerClose>
              </div>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </section>
  );
}

function Legend() {
  return (
    <div className="text-fg-subtle flex items-center gap-2 text-caption">
      <span>Less</span>
      <div className="flex items-center gap-1">
        {[0.2, 0.4, 0.6, 0.85].map((a) => (
          <span
            key={a}
            className="size-3 rounded-sm"              style={{
                backgroundColor: 'var(--color-bull)',
                opacity: a,
              }}
            aria-hidden="true"
          />
        ))}
        {[0.85, 0.6, 0.4, 0.2].map((a) => (
          <span
            key={a}
            className="size-3 rounded-sm"              style={{
                backgroundColor: 'var(--color-bear)',
                opacity: a,
              }}
            aria-hidden="true"
          />
        ))}
      </div>
      <span>More</span>
    </div>
  );
}
