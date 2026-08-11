// SPDX-License-Identifier: Apache-2.0

'use client';

// Phase 1.6 — Watchlist widget.
//
// Live tickers for a curated list of symbols, with mid-price + a small
// sparkline of the most recent mids. Uses the existing `usePrices` hook
// so updates pool through the shared 3s cache (no per-widget polls).
//
// Sparkline: we keep a rolling buffer of mid prices per symbol in a ref
// so the widget never re-renders for ticks that don't move the visible
// window. The buffer is intentionally short (10 samples) — this is a
// pulse, not a chart.

import Link from 'next/link';
import { useEffect, useReducer, useRef, useState, type MutableRefObject } from 'react';
import { IconEye, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import type { Symbol, Tick } from '@kestrel/shared';
import { priceDecimals } from '@kestrel/shared';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SparklineCanvas } from '@/components/ui/sparkline-canvas';
import { usePrices } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';

const DEFAULT_WATCHLIST: Symbol[] = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'BTCUSDT',
  'ETHUSDT',
];

const BUFFER_SIZE = 10;

interface WatchlistWidgetProps {
  symbols?: Symbol[];
}

export function WatchlistWidget({
  symbols = DEFAULT_WATCHLIST,
}: WatchlistWidgetProps) {
  const list: Symbol[] = symbols ?? DEFAULT_WATCHLIST;
  const tickQuery = usePrices(list);
  const data = tickQuery.data;
  const isLoading = tickQuery.isLoading;
  const isError = tickQuery.isError;
  const error = tickQuery.error;
  const refetch = tickQuery.refetch;
  const buffersRef = useRef<Map<Symbol, number[]>>(new Map());

  // Bump a counter each time new ticks arrive so the sparkline picks up
  // the buffer change without us storing React state per-symbol.
  const [tickVersion, bumpVersion] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!data) return;
    let changed = false;
    for (const t of data) {
      const buf = buffersRef.current.get(t.symbol) ?? [];
      buf.push(t.mid);
      if (buf.length > BUFFER_SIZE) buf.shift();
      buffersRef.current.set(t.symbol, buf);
      changed = true;
    }
    if (changed) bumpVersion();
  }, [data]);

  return (
    <Card as="section"      aria-label="Market overview">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconEye className="text-fg-subtle size-4" />
          <span className="text-fg text-body-sm font-semibold">Market overview</span>
          <Badge tone="brand" className="hidden sm:inline-flex">Live</Badge>
        </div>
        <Link
          href={`/chart/${list[0] ?? 'XAUUSD'}`}
          className="text-fg-subtle hover:text-fg text-caption"
        >
          Open chart
        </Link>
      </header>

      <ul className="flex flex-col">
        {(() => {
          if (isError) {
            return (
              <li role="alert" className="flex flex-col items-center gap-2 py-4 text-center">
                <IconAlertTriangle className="size-5 text-danger" aria-hidden="true" />
                <p className="text-danger text-xs">
                  {error instanceof Error ? error.message : 'Failed to load prices'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex min-h-10 items-center gap-1 rounded-sm border border-border px-3 text-fg-subtle hover:text-fg text-caption"
                >
                  <IconRefresh className="size-3" aria-hidden="true" />
                  Retry
                </button>
              </li>
            );
          }
          if (isLoading && (!data || data.length === 0)) {
            return Array.from({ length: list.length }).map((_, i) => (
              <li
                key={i}
                className="border-divider flex items-center justify-between border-b py-2 last:border-0"
              >
                <Skeleton decorative className="h-3 w-16" />
                <Skeleton decorative className="h-3 w-12" />
              </li>
            ));
          }
          return data?.map((t) => (
            <WatchRow
              key={t.symbol}
              tick={t}
              tickVersion={tickVersion}
              buffersRef={buffersRef}
            />
          ));
        })()}
      </ul>
    </Card>
  );
}

const FLASH_MS = 600;

type FlashTone = 'bull' | 'bear' | null;

function WatchRow({
  tick,
  tickVersion,
  buffersRef,
}: {
  tick: Tick;
  tickVersion: number;
  buffersRef: MutableRefObject<Map<Symbol, number[]>>;
}) {
  // tickVersion is referenced so React knows the row re-rendered on update.
  void tickVersion;
  const buf = buffersRef.current.get(tick.symbol) ?? [];
  const decimals = priceDecimals(tick.symbol);
  const first = buf[0] ?? tick.mid;
  const last = tick.mid;
  const isBull = last >= first;

  // Live-tick flash: brief green/red tint behind the price when it moves.
  const [flash, setFlash] = useState<FlashTone>(null);
  const prevMidRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevMidRef.current;
    prevMidRef.current = last;
    if (prev === null || prev === last) return;
    setFlash(last > prev ? 'bull' : 'bear');
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [last]);

  return (
    <li className="border-divider flex items-center justify-between gap-3 border-b py-2 last:border-0">
      <div className="flex min-w-0 flex-col font-mono">
        <span className="text-fg text-body-sm font-bold tracking-tight">{tick.symbol}</span>
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-sm px-1 -mx-1 text-caption tabular-nums transition-colors duration-500',
            flash === 'bull' && 'bg-bull/15 text-bull',
            flash === 'bear' && 'bg-bear/15 text-bear',
            flash === null && 'text-fg-subtle',
          )}
        >
          {last.toFixed(decimals)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {buf.length >= 2 ? (
          <SparklineCanvas
            values={buf}
            tone={isBull ? 'bull' : 'bear'}
            label={`${tick.symbol} trend`}
          />
        ) : (
          <div className="h-6 w-16" aria-hidden />
        )}
        <span
          className={cn(
            'text-caption tabular-nums',
            isBull ? 'text-bull' : 'text-bear',
          )}
          aria-label={isBull ? 'Trending up' : 'Trending down'}
        >
          {isBull ? '▲' : '▼'}
        </span>
      </div>
    </li>
  );
}
