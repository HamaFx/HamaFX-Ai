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

// Phase 1.6 — Open positions widget.
//
// Lists journal entries with `outcome === 'open'`. Each row shows the
// symbol, side, entry, stop, target, and the current R-multiple (when
// computable). Links out to /journal for the full table.

import Link from 'next/link';
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { JournalEntry } from '@hamafx/shared';
import { priceDecimals } from '@hamafx/shared';

import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';

interface OpenPositionsWidgetProps {
  entries: readonly JournalEntry[];
  /** Max number of rows shown before linking out. */
  limit?: number;
}

export function OpenPositionsWidget({
  entries,
  limit = 5,
}: OpenPositionsWidgetProps) {
  const open = entries.filter((e) => e.outcome === 'open').slice(0, limit);

  return (
    <section
      aria-label="Open positions"
      className="border-divider bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="text-fg-subtle size-4" />
          <span className="text-fg text-body-sm font-semibold">
            Open positions
          </span>
          {open.length > 0 ? (
            <span className="text-fg-subtle text-caption tabular-nums">
              {open.length}
            </span>
          ) : null}
        </div>
        <Link href="/journal" className="text-fg-subtle hover:text-fg text-caption">
          View all
        </Link>
      </header>

      {open.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-5" />}
          title="No open positions"
          description="Active trades will appear here when you log them."
          tone="muted"
          bare
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col">
          {open.map((e) => (
            <li
              key={e.id}
              className="border-divider/40 flex items-center justify-between gap-3 border-b py-2 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'inline-flex size-5 shrink-0 items-center justify-center rounded',
                    e.side === 'long'
                      ? 'bg-bull/15 text-bull'
                      : 'bg-bear/15 text-bear',
                  )}
                >
                  {e.side === 'long' ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownRight className="size-3.5" />
                  )}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-fg text-body-sm font-semibold">
                    {e.symbol}
                  </span>
                  <span className="text-fg-subtle text-caption tabular-nums">
                    {e.entry !== null
                      ? `Entry ${e.entry.toFixed(priceDecimals(e.symbol))}`
                      : 'Entry —'}
                    {e.stop !== null
                      ? ` · SL ${e.stop.toFixed(priceDecimals(e.symbol))}`
                      : ''}
                  </span>
                </div>
              </div>
              <span className="text-fg-subtle text-caption tabular-nums shrink-0">
                {e.openedAt ? formatRelative(e.openedAt) : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
