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
import { useEffect, useReducer, useRef, type MutableRefObject } from 'react';
import { IconEye, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import type { Symbol, Tick } from '@hamafx/shared';
import { priceDecimals } from '@hamafx/shared';

import { Sparkline } from '@/components/ui/sparkline';
import { usePrices } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';

const DEFAULT_WATCHLIST: Symbol[] = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'BTCUSD',
  'US100',
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
    <section
      aria-label="Watchlist"
      className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconEye className="text-fg-subtle size-4" />
          <span className="text-fg text-body-sm font-semibold">Watchlist</span>
        </div>
        <Link
          href="/chart"
          className="text-fg-subtle hover:text-fg text-caption"
        >
          Open chart
        </Link>
      </header>

      <ul className="flex flex-col">
        {(() => {
          if (isError) {
            return (
              <li className="flex flex-col items-center gap-2 py-4 text-center">
                <IconAlertTriangle className="size-5 text-danger" />
                <p className="text-danger text-xs">
                  {error instanceof Error ? error.message : 'Failed to load prices'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center gap-1 text-fg-subtle hover:text-fg text-caption"
                >
                  <IconRefresh className="size-3" />
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
                <div className="bg-bg-elev-2 h-3 w-16 animate-pulse rounded-sm" />
                <div className="bg-bg-elev-2 h-3 w-12 animate-pulse rounded-sm" />
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
    </section>
  );
}

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
  return (
    <li className="border-divider flex items-center justify-between gap-3 border-b py-2 last:border-0">
      <div className="flex min-w-0 flex-col">
        <span className="text-fg text-body-sm font-semibold">{tick.symbol}</span>
        <span className="text-fg-subtle text-caption tabular-nums">
          {last.toFixed(decimals)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {buf.length >= 2 ? (
          <Sparkline
            values={buf}
            className={cn('h-4 w-16', isBull ? 'text-bull' : 'text-bear')}
            label={`${tick.symbol} trend`}
          />
        ) : (
          <div className="h-4 w-16" aria-hidden />
        )}
        <span
          className={cn(
            'text-caption tabular-nums',
            isBull ? 'text-bull' : 'text-bear',
          )}
        >
          {isBull ? '▲' : '▼'}
        </span>
      </div>
    </li>
  );
}
