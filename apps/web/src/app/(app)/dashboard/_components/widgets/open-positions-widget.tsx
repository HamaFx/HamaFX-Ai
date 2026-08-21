// SPDX-License-Identifier: Apache-2.0

'use client';

// Phase 1.6 — Open positions widget.
//
// Lists journal entries with `outcome === 'open'`. Each row shows the
// symbol, side, entry, stop, target, and the current R-multiple (when
// computable). Links out to /journal for the full table.
//
// Enhanced with:
// - 1-Click "Ask AI Copilot" position management & trailing stop review
// - Live-tick flashing and floating R tracking

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconActivity,
  IconArrowUpRight,
  IconArrowDownRight,
  IconBolt,
} from '@tabler/icons-react';
import type { JournalEntry, Symbol as SymbolType, Tick } from '@kestrel/shared';
import { priceDecimals, pipSize } from '@kestrel/shared';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/lib/format';
import { usePrices } from '@/hooks/use-prices';
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
  const openSymbols = useMemo(
    () => Array.from(new Set(open.map((e) => e.symbol))) as SymbolType[],
    [open],
  );
  const tickQuery = usePrices(openSymbols);
  const liveTicks = tickQuery.data ?? [];
  const tickMap = new Map<string, Tick>(liveTicks.map((t) => [t.symbol, t]));

  return (
    <Card as="section" aria-label="Open positions">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconActivity className="text-fg-subtle size-4" />
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
          icon={<IconActivity className="size-5" />}
          title="No open positions"
          description="Active trades will appear here when you log them."
          tone="muted"
          bare
          className="py-4"
        />
      ) : (
        <ul className="flex flex-col">
          {open.map((e) => (
            <PositionRow
              key={e.id}
              entry={e}
              tick={tickMap.get(e.symbol)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PositionRow({ entry, tick }: { entry: JournalEntry; tick?: Tick }) {
  const decimals = priceDecimals(entry.symbol);
  const curPrice = tick?.mid;

  const [flash, setFlash] = useState<'bull' | 'bear' | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  useEffect(() => {
    if (curPrice === undefined) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = curPrice;
    if (prev === null || prev === curPrice) return;
    setFlash(curPrice > prev ? 'bull' : 'bear');
    const timer = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(timer);
  }, [curPrice]);

  let floatingR: number | null = null;
  let pipsDiff = 0;
  if (curPrice && entry.entry) {
    const diff = entry.side === 'long' ? curPrice - entry.entry : entry.entry - curPrice;
    pipsDiff = diff / pipSize(entry.symbol);
    if (entry.stop) {
      const risk = entry.side === 'long' ? entry.entry - entry.stop : entry.stop - entry.entry;
      if (risk > 0) floatingR = diff / risk;
    }
  }

  const isProfitable = floatingR !== null ? floatingR >= 0 : pipsDiff >= 0;

  const aiPrompt = encodeURIComponent(
    `Review risk, trailing stop placement, and exit targets for my open ${entry.symbol} ${entry.side.toUpperCase()} position entered at ${entry.entry}${entry.stop ? `, stop ${entry.stop}` : ''}${curPrice ? `, current price ${curPrice}` : ''}.`,
  );

  return (
    <li className="border-divider flex items-center justify-between gap-2 border-b py-2 last:border-0 group">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-sm',
            entry.side === 'long' ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear',
          )}
        >
          {entry.side === 'long' ? (
            <IconArrowUpRight className="size-3.5" />
          ) : (
            <IconArrowDownRight className="size-3.5" />
          )}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="text-fg text-body-sm font-semibold">{entry.symbol}</span>
            {curPrice && (
              <span
                className={cn(
                  'text-caption tabular-nums px-1 rounded-sm transition-colors duration-500',
                  flash === 'bull' && 'bg-bull/20 text-bull',
                  flash === 'bear' && 'bg-bear/20 text-bear',
                  flash === null && 'text-fg-subtle',
                )}
              >
                {curPrice.toFixed(decimals)}
              </span>
            )}
          </div>
          <span className="text-fg-subtle text-caption tabular-nums">
            {entry.entry !== null ? `Entry ${entry.entry.toFixed(decimals)}` : 'Entry —'}
            {entry.stop !== null ? ` · SL ${entry.stop.toFixed(decimals)}` : ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex flex-col items-end font-mono">
          {floatingR !== null ? (
            <span
              className={cn(
                'text-xs font-bold tabular-nums',
                isProfitable ? 'text-bull' : 'text-bear',
              )}
            >
              {floatingR >= 0 ? '+' : ''}
              {floatingR.toFixed(2)}R
            </span>
          ) : curPrice ? (
            <span
              className={cn(
                'text-caption font-bold tabular-nums',
                isProfitable ? 'text-bull' : 'text-bear',
              )}
            >
              {pipsDiff >= 0 ? '+' : ''}
              {pipsDiff.toFixed(1)}p
            </span>
          ) : null}
          <span className="text-fg-subtle text-[10px] tabular-nums">
            {entry.openedAt ? formatRelative(entry.openedAt) : ''}
          </span>
        </div>

        {/* 1-Click Ask AI Copilot */}
        <Link
          href={`/chat?prompt=${aiPrompt}`}
          className="text-fg-subtle hover:text-brand hover:bg-brand/10 rounded-sm p-1 transition-colors"
          title={`Ask AI Copilot to review ${entry.symbol} position`}
          aria-label={`Ask AI Copilot to review ${entry.symbol} position`}
        >
          <IconBolt className="size-3.5 text-brand" />
        </Link>
      </div>
    </li>
  );
}
