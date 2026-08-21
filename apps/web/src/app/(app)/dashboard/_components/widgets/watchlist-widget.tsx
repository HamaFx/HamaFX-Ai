// SPDX-License-Identifier: Apache-2.0

'use client';

// Phase 1.6 — Watchlist widget.
//
// Live tickers for a curated list of symbols, with mid-price + a small
// sparkline of the most recent mids. Uses the existing `usePrices` hook
// so updates pool through the shared 3s cache (no per-widget polls).
//
// Features:
// - Customizable symbol list with localStorage persistence
// - 1-Click "Ask AI Copilot" deep prompt link on every symbol
// - Direct link to interactive TradingView chart
// - Live-tick flash animation and mini sparkline

import Link from 'next/link';
import { useEffect, useReducer, useRef, useState, type MutableRefObject } from 'react';
import {
  IconEye,
  IconRefresh,
  IconAlertTriangle,
  IconBolt,
  IconPlus,
  IconX,
  IconChartLine,
} from '@tabler/icons-react';
import { SYMBOLS, type Symbol, type Tick, priceDecimals } from '@kestrel/shared';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SparklineCanvas } from '@/components/ui/sparkline-canvas';
import { usePrices } from '@/hooks/use-prices';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { cn } from '@/lib/cn';

const DEFAULT_WATCHLIST: Symbol[] = [
  'XAUUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'BTCUSDT',
  'ETHUSDT',
];

const WATCHLIST_STORAGE_KEY = 'kestrel:watchlist-symbols:v1';
const BUFFER_SIZE = 10;

interface WatchlistWidgetProps {
  symbols?: Symbol[];
}

export function WatchlistWidget({ symbols }: WatchlistWidgetProps) {
  const [persistedSymbols, setPersistedSymbols, hydrated] = useLocalStorage<Symbol[]>(
    WATCHLIST_STORAGE_KEY,
    symbols ?? DEFAULT_WATCHLIST,
  );

  const list: Symbol[] = hydrated ? persistedSymbols : (symbols ?? DEFAULT_WATCHLIST);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

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

  // Close add menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    if (showAddMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showAddMenu]);

  function addSymbol(sym: Symbol) {
    if (!list.includes(sym)) {
      setPersistedSymbols([...list, sym]);
    }
    setShowAddMenu(false);
  }

  function removeSymbol(sym: Symbol) {
    if (list.length > 1) {
      setPersistedSymbols(list.filter((s) => s !== sym));
    }
  }

  const availableToAdd = (SYMBOLS as readonly Symbol[]).filter(
    (s) => !list.includes(s),
  );

  return (
    <Card as="section" aria-label="Market overview">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconEye className="text-fg-subtle size-4" />
          <span className="text-fg text-body-sm font-semibold">Market overview</span>
          <Badge tone="brand" className="hidden sm:inline-flex">Live</Badge>
        </div>
        <div className="flex items-center gap-1.5 relative" ref={addMenuRef}>
          {availableToAdd.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              className="text-fg-subtle hover:text-fg text-caption flex items-center gap-0.5 p-1 rounded-sm hover:bg-bg-elev-2 transition-colors"
              title="Add symbol to watchlist"
            >
              <IconPlus className="size-3.5" />
              <span>Add</span>
            </button>
          )}

          {showAddMenu && (
            <div className="absolute right-0 top-full mt-1 z-30 flex flex-col gap-0.5 min-w-[140px] max-h-48 overflow-y-auto rounded-sm border border-border bg-bg-elev-2 p-1 shadow-lg">
              {availableToAdd.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => addSymbol(sym)}
                  className="w-full text-left px-2 py-1 text-xs font-mono font-medium text-fg hover:bg-bg-elev-3 rounded-xs transition-colors"
                >
                  {sym}
                </button>
              ))}
            </div>
          )}

          <Link
            href={`/chart/${list[0] ?? 'XAUUSD'}`}
            className="text-fg-subtle hover:text-fg text-caption ml-1"
          >
            Open chart
          </Link>
        </div>
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
              canRemove={list.length > 1}
              onRemove={() => removeSymbol(t.symbol)}
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
  canRemove,
  onRemove,
}: {
  tick: Tick;
  tickVersion: number;
  buffersRef: MutableRefObject<Map<Symbol, number[]>>;
  canRemove: boolean;
  onRemove: () => void;
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

  const aiPrompt = encodeURIComponent(
    `Analyze market structure, key liquidity levels, and intraday trading bias for ${tick.symbol}`,
  );

  return (
    <li className="border-divider flex items-center justify-between gap-2 border-b py-2 last:border-0 group">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex flex-col font-mono min-w-0">
          <Link
            href={`/chart/${tick.symbol}`}
            className="text-fg text-body-sm font-bold tracking-tight hover:text-brand transition-colors flex items-center gap-1"
            title={`Open ${tick.symbol} chart`}
          >
            <span>{tick.symbol}</span>
            <IconChartLine className="size-3 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
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
      </div>

      <div className="flex items-center gap-2">
        {buf.length >= 2 ? (
          <SparklineCanvas
            values={buf}
            tone={isBull ? 'bull' : 'bear'}
            label={`${tick.symbol} trend`}
          />
        ) : (
          <div className="h-6 w-14" aria-hidden />
        )}

        <span
          className={cn(
            'text-caption tabular-nums w-4 text-center font-bold',
            isBull ? 'text-bull' : 'text-bear',
          )}
          aria-label={isBull ? 'Trending up' : 'Trending down'}
        >
          {isBull ? '▲' : '▼'}
        </span>

        {/* 1-Click Ask AI Copilot */}
        <Link
          href={`/chat?prompt=${aiPrompt}`}
          className="text-fg-subtle hover:text-brand hover:bg-brand/10 rounded-sm p-1 transition-colors"
          title={`Ask AI Copilot to analyze ${tick.symbol}`}
          aria-label={`Ask AI Copilot to analyze ${tick.symbol}`}
        >
          <IconBolt className="size-3.5 text-brand" />
        </Link>

        {/* Remove symbol button in edit hover */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-fg-subtle hover:text-danger p-0.5 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
            title={`Remove ${tick.symbol} from watchlist`}
            aria-label={`Remove ${tick.symbol}`}
          >
            <IconX className="size-3" />
          </button>
        )}
      </div>
    </li>
  );
}
