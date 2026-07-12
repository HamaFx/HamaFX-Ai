'use client';

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

// Advanced trade list with real-time price tracking, dynamic PnL sliders,
// and powerful tabs/filters (Active, Closed, All, symbols, sides, text searches).

import type { JournalEntry, Symbol, TradeSide } from '@hamafx/shared';
import { pipSize, getSymbolDefinition } from '@hamafx/shared';
import {IconTrash, IconSearch, IconAdjustmentsHorizontal, IconArrowUpRight, IconArrowDownRight, IconCompass, IconPlayerPlay} from '@tabler/icons-react';
import Image from 'next/image';
import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { usePrices } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';
import { fetchCsrf } from '@/lib/csrf';

interface EntryListProps {
  entries: JournalEntry[];
  onClosed: () => void;
  onDeleted: () => void;
}

export function EntryList({ entries, onClosed, onDeleted }: EntryListProps) {
  const [confirmEl, confirm] = useConfirm();

  // State for Tabs & Filters
  const [tab, setTab] = useState<'active' | 'closed' | 'all'>('active');
  const [symbolFilter, setSymbolFilter] = useState<'ALL' | Symbol>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | TradeSide>('ALL');
  const [tagFilter, setTagFilter] = useState<'ALL' | string>('ALL');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Derive available symbols and tags from entries for the filter panel
  const availableSymbols = useMemo(() => {
    const symbolsSet = new Set<Symbol>();
    entries.forEach((e) => symbolsSet.add(e.symbol));
    return Array.from(symbolsSet).sort();
  }, [entries]);

  const availableTags = useMemo(() => {
    const tagsSet = new Set<string>();
    entries.forEach((e) => e.tags?.forEach((t) => tagsSet.add(t)));
    return Array.from(tagsSet).sort();
  }, [entries]);

  // Pre-compute relative time labels in the parent to avoid per-row recomputation
  const timeLabels = useMemo(() => {
    const map = new Map<string, { openedAt: string; closedAt: string | null }>();
    entries.forEach((e) => {
      map.set(e.id, {
        openedAt: relative(e.openedAt),
        closedAt: e.closedAt ? relative(e.closedAt) : null,
      });
    });
    return map;
  }, [entries]);

  // Extract all symbols from open/active trades to subscribe to the price feed
  const activeSymbols = useMemo(() => {
    const symbolsSet = new Set<Symbol>();
    entries.forEach((e) => {
      if (e.outcome === 'open') {
        symbolsSet.add(e.symbol);
      }
    });
    return Array.from(symbolsSet);
  }, [entries]);

  // Hook live prices (polls every 1.5s)
  const { data: ticks } = usePrices(activeSymbols);

  const priceMap = useMemo(() => {
    const map = new Map<Symbol, number>();
    ticks?.forEach((t) => map.set(t.symbol, t.mid));
    return map;
  }, [ticks]);

  // IconFilter entries based on active tab
  const tabEntries = useMemo(() => {
    return entries.filter((e) => {
      if (tab === 'active') return e.outcome === 'open';
      if (tab === 'closed') return e.outcome !== 'open';
      return true; // 'all'
    });
  }, [entries, tab]);

  // Apply symbol, side, tag and text search filters
  const filteredEntries = useMemo(() => {
    return tabEntries.filter((e) => {
      if (symbolFilter !== 'ALL' && e.symbol !== symbolFilter) return false;
      if (sideFilter !== 'ALL' && e.side !== sideFilter) return false;
      if (tagFilter !== 'ALL' && !e.tags?.includes(tagFilter)) return false;
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesNote = e.notes?.toLowerCase().includes(query) ?? false;
        const matchesTag = e.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
        const matchesSymbol = e.symbol.toLowerCase().includes(query);
        if (!matchesNote && !matchesTag && !matchesSymbol) return false;
      }
      return true;
    });
  }, [tabEntries, symbolFilter, sideFilter, tagFilter, search]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const activeCount = entries.filter((e) => e.outcome === 'open').length;
  const closedCount = entries.filter((e) => e.outcome !== 'open').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Visual Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-2">
        <div className="flex p-0.5 rounded-sm bg-bg-elev-2 border border-border/40 self-start">
          <button
            onClick={() => setTab('active')}
            className={cn(
              'px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all relative flex items-center gap-1.5 cursor-pointer',
              tab === 'active' ? 'bg-fg text-black shadow-sm' : 'text-fg-muted hover:text-fg'
            )}
          >
            Active Positions
            {activeCount > 0 && (
              <span className={cn(
                'size-2 rounded-sm',
                tab === 'active' ? 'bg-fg animate-ping' : 'bg-fg animate-pulse'
              )} />
            )}
          </button>
          <button
            onClick={() => setTab('closed')}
            className={cn(
              'px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all cursor-pointer',
              tab === 'closed' ? 'bg-fg text-black shadow-sm' : 'text-fg-muted hover:text-fg'
            )}
          >
            Closed History
            <span className="text-caption opacity-70 ml-1">({closedCount})</span>
          </button>
          <button
            onClick={() => setTab('all')}
            className={cn(
              'px-3.5 py-1.5 text-xs font-semibold rounded-sm transition-all cursor-pointer',
              tab === 'all' ? 'bg-fg text-black shadow-sm' : 'text-fg-muted hover:text-fg'
            )}
          >
            All Logs
          </button>
        </div>

        {/* IconFilter Trigger & IconSearch Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <IconSearch className="absolute left-3.5 top-3 size-3.5 text-fg-muted" />
            <input
              type="text"
              placeholder="Search notes, tags, symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-sm bg-bg-elev-2/45 border border-border/40 focus:outline-none focus:border-border/70 transition-all text-fg"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'p-2.5 rounded-sm border border-border/40 bg-bg-elev-2/45 text-fg-muted hover:text-fg transition-all cursor-pointer',
              showFilters && 'border-border text-fg bg-bg-elev-1'
            )}
            title="Toggle advanced filters"
          >
            <IconAdjustmentsHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* Advanced IconFilter Panel */}
      {showFilters && (
        <div className="border border-border bg-bg-elev-1 rounded-sm p-4 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Asset Class</label>
              <div className="flex flex-wrap gap-1">
                {(['ALL', ...availableSymbols] as const).map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbolFilter(sym)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-sm border border-border bg-bg-elev-3/50 hover:bg-bg-elev-3 cursor-pointer',
                    symbolFilter === sym && 'border-border bg-bg-elev-2 text-fg'
                  )}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Direction</label>
            <div className="flex flex-wrap gap-1">
              {(['ALL', 'long', 'short'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setSideFilter(side)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-sm border border-border bg-bg-elev-3/50 hover:bg-bg-elev-3 cursor-pointer',
                    sideFilter === side && 'border-border bg-bg-elev-2 text-fg'
                  )}
                >
                  {side === 'ALL' ? 'ALL' : side === 'long' ? 'Buy ↑' : 'Sell ↓'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 col-span-2">
            <label className="text-caption font-bold uppercase tracking-wider text-fg-subtle">Tag</label>
            <div className="flex flex-wrap gap-1">
              {(['ALL', ...availableTags] as const).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-sm border border-border bg-bg-elev-3/50 hover:bg-bg-elev-3 cursor-pointer',
                    tagFilter === tag && 'border-border bg-bg-elev-2 text-fg'
                  )}
                >
                  {tag === 'ALL' ? 'ALL' : `#${tag}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Entries IconList */}
      {filteredEntries.length === 0 ? (
        <div className="border border-border bg-bg-elev-1 rounded-sm p-8 text-center flex flex-col items-center justify-center gap-2">
          <div className="size-10 rounded-sm bg-bg-elev-2 border border-border flex items-center justify-center text-fg-muted">
            <IconCompass className="size-5" />
          </div>
          <p className="text-sm font-semibold text-fg">No entries found</p>
          <p className="text-xs text-fg-subtle max-w-[280px]">
            {search || symbolFilter !== 'ALL' || sideFilter !== 'ALL' || tagFilter !== 'ALL'
              ? 'Try modifying your search query or filters.'
              : 'Log your first trade to activate your portfolio analytics.'}
          </p>
        </div>
      ) : (
        <div
          ref={parentRef}
          className="scrollbar-thin scrollbar-thumb-divider overflow-y-auto pr-1"
          style={{ maxHeight: '750px' }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((item) => {
              const e = filteredEntries[item.index];
              if (!e) return null;
              const labels = timeLabels.get(e.id);
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                  }}
                  className="py-1.5"
                >
                  <EntryRow
                    entry={e}
                    openedAtLabel={labels?.openedAt ?? ''}
                    closedAtLabel={labels?.closedAt ?? ''}
                    livePrice={priceMap.get(e.symbol)}
                    onClosed={onClosed}
                    onDeleted={onDeleted}
                    confirm={confirm}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {confirmEl}
    </div>
  );
}

type ConfirmFn = ReturnType<typeof useConfirm>[1];

function EntryRow({
  entry,
  openedAtLabel,
  closedAtLabel,
  livePrice,
  onClosed,
  onDeleted,
  confirm,
}: {
  entry: JournalEntry;
  openedAtLabel: string;
  closedAtLabel?: string;
  livePrice?: number | undefined;
  onClosed: () => void;
  onDeleted: () => void;
  confirm: ConfirmFn;
}) {
  const [closing, setClosing] = useState(false);
  const [exit, setExit] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setBusy(true);
    setError(null);
    const exitNum = Number(exit);
    if (!Number.isFinite(exitNum)) {
      setBusy(false);
      setError('Exit must be a number');
      return;
    }
    try {
      const res = await fetchCsrf(`/api/journal/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ exit: exitNum, closedAt: Date.now() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClosing(false);
      setExit('');
      onClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'close failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete this entry?',
      description: `${entry.symbol} ${entry.side} @ ${entry.entry} will be permanently removed.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetchCsrf(`/api/journal/${entry.id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  // Calculate Real-Time Live Profit / Loss Metrics
  const liveStats = useMemo(() => {
    if (entry.outcome !== 'open' || !livePrice) return null;

    const diff = entry.side === 'long' ? livePrice - entry.entry : entry.entry - livePrice;
    
    // Pip calculations: use symbol definition pipSize for correct multiplier
    const pipMultiplier = 1 / pipSize(entry.symbol);
    const pips = diff * pipMultiplier;

    // USD Cash calculations (size = lots)
    // Contract sizes: Gold = 100, Forex = 100000
    let cashPnl = 0;
    if (entry.size !== null) {
      const def = getSymbolDefinition(entry.symbol);
      const isCommodity = def?.currencies?.includes('XAU') ?? false;
      const contractSize = isCommodity ? 100 : 100000;
      cashPnl = entry.size * contractSize * diff;
    }

    // R-multiple calculations
    let rMultiple = 0;
    if (entry.stop !== null) {
      const risk = entry.side === 'long' ? entry.entry - entry.stop : entry.stop - entry.entry;
      rMultiple = risk > 0 ? diff / risk : 0;
    }

    return { pips, cashPnl, rMultiple };
  }, [entry, livePrice]);

  // Compute horizontal slider positioning for Stop Loss and IconTarget
  const sliderPosition = useMemo(() => {
    if (!livePrice || entry.stop === null || entry.target === null) return null;

    const stopPrice = entry.stop;
    const targetPrice = entry.target;

    let percentage = 0;

    if (entry.side === 'long') {
      const range = targetPrice - stopPrice;
      percentage = range > 0 ? ((livePrice - stopPrice) / range) * 100 : 50;
    } else {
      // Short
      const range = stopPrice - targetPrice;
      percentage = range > 0 ? ((stopPrice - livePrice) / range) * 100 : 50;
    }

    // Allow beyond-range values for "beyond stop/target" states
    return Math.min(Math.max(percentage, -20), 120);
  }, [entry, livePrice]);

  const sideColor = entry.side === 'long' ? 'text-bull' : 'text-bear';
  const sideBg = entry.side === 'long' ? 'bg-bull/10 border-bull/20' : 'bg-bear/10 border-bear/20';
  
  const isWin = entry.outcome === 'win' || (liveStats && liveStats.rMultiple > 0);
  const isLoss = entry.outcome === 'loss' || (liveStats && liveStats.rMultiple < 0);

  const outcomeColor = isWin ? 'text-bull' : isLoss ? 'text-bear' : 'text-fg-muted';

  return (
    <li className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-3.5 p-4 hover:border-fg-muted/30 hover:shadow-sm transition-all duration-200">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          {/* Header Row */}
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold tabular-nums">
            <span className={cn(
              'px-2 py-0.5 text-caption font-black uppercase tracking-wider rounded-sm border',
              sideBg,
              sideColor
            )}>
              {entry.side}
            </span>
            <span className="text-fg text-base tracking-tight">{entry.symbol}</span>
            <span className="text-fg-muted font-medium text-xs">at</span>
            <span className="text-fg font-extrabold">{entry.entry}</span>

            {/* Sizing lot indicator */}
            {entry.size !== null && (
              <span className="text-caption font-medium text-fg-subtle px-1.5 py-0.5 rounded-sm bg-bg-elev-3 border border-border/40">
                {entry.size} Lots
              </span>
            )}
          </div>

          {/* Opened & Closed Dates */}
          <p className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            <span>Opened {openedAtLabel}</span>
            {entry.closedAt && closedAtLabel && (
              <>
                <span className="text-fg-muted/50">·</span>
                <span>Closed {closedAtLabel}</span>
              </>
            )}
          </p>

          {/* Tags Strip */}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 text-xs font-black uppercase tracking-wider rounded-sm bg-bg-elev-1 border border-border/20 text-fg"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Screenshot thumbnail */}
          {entry.screenshotUrl && (
            <button
              type="button"
              onClick={() => { if (entry.screenshotUrl) window.open(entry.screenshotUrl, '_blank'); }}
              className="mt-1.5 inline-flex"
            >
              <Image
                src={entry.screenshotUrl}
                alt="Trade chart screenshot"
                width={48}
                height={48}
                className="size-12 rounded-sm object-cover border border-border hover:opacity-80 transition-opacity"
                unoptimized
              />
            </button>
          )}

          {/* Notes display */}
          {entry.notes && (
            <p className="text-fg-muted text-xs leading-[1.4] mt-1.5 border-l-2 border-border/70 pl-2.5 py-0.5">
              {entry.notes}
            </p>
          )}
        </div>

        {/* Action Panel / Metrics on Right Side */}
        <div className="flex shrink-0 flex-col items-end gap-2.5">
          {/* Outcome realization display */}
          {entry.outcome === 'open' ? (
            liveStats ? (
              <div className="flex flex-col items-end gap-0.5">
                {/* Live R Multiple */}
                {entry.stop !== null && (
                  <span className={cn('text-sm font-extrabold tabular-nums flex items-center gap-0.5', outcomeColor)}>
                    {liveStats.rMultiple >= 0 ? <IconArrowUpRight className="size-4" /> : <IconArrowDownRight className="size-4" />}
                    {liveStats.rMultiple >= 0 ? '+' : ''}{liveStats.rMultiple.toFixed(2)}R
                  </span>
                )}
                {/* Live cash value or Pip distance */}
                <span className="text-caption font-bold text-fg-muted tracking-wide tabular-nums">
                  {entry.size !== null 
                    ? `${liveStats.cashPnl >= 0 ? '+' : ''}$${liveStats.cashPnl.toFixed(2)}`
                    : `${liveStats.pips >= 0 ? '+' : ''}${liveStats.pips.toFixed(1)} Pips`
                  }
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-fg font-bold text-xs animate-pulse">
                <IconPlayerPlay className="size-3 fill-brand" />
                <span>Live polling...</span>
              </div>
            )
          ) : (
            <div className="flex flex-col items-end">
              <span className={cn('text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-sm bg-bg-elev-3 border border-border/40', outcomeColor)}>
                {entry.outcome}
              </span>
              {entry.rMultiple !== null && (
                <span className={cn('text-sm font-extrabold mt-1 tabular-nums', outcomeColor)}>
                  {entry.rMultiple >= 0 ? '+' : ''}{entry.rMultiple.toFixed(2)}R
                </span>
              )}
            </div>
          )}

          {/* CTA controls */}
          <div className="flex items-center gap-1">
            {entry.outcome === 'open' && !closing && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setClosing(true)}
                className="cursor-pointer"
              >
                Close...
              </Button>
            )}
            
            <Tooltip label="Delete Log">
              <button
                type="button"
                aria-label="Delete entry"
                onClick={() => void remove()}
                disabled={busy}
                className="text-bear/75 hover:text-bear hover:bg-bear/10 inline-flex size-9 items-center justify-center rounded-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <IconTrash className="size-4" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Real-time Visual SL-to-TP Slider Bar */}
      {entry.outcome === 'open' && entry.stop !== null && entry.target !== null && livePrice && sliderPosition !== null && (
        <div className="border-t border-border/30 pt-3 flex flex-col gap-1.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-fg-subtle">
            <span className="text-bear">SL: {entry.stop}</span>
            <span className="text-fg-muted">Entry: {entry.entry}</span>
            <span className="text-bull">Target: {entry.target}</span>
          </div>

          <div className="relative h-2 w-full rounded-sm bg-bg-elev-3 border border-border/20 overflow-visible mt-1 flex items-center">
            {/* Entry Line Indicator */}
            <div
              style={{
                left: entry.side === 'long'
                  ? `${((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100}%`
                  : `${((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100}%`
              }}
              className="absolute h-4 w-0.5 bg-warn/80 z-10"
              title="Entry Price Level"
            />

            {/* Glowing Live Dot */}
            <div
              style={{ left: `${sliderPosition}%` }}
              className={cn(
                'absolute size-3 rounded-sm -translate-x-1/2 z-20 shadow-md border border-fg transition-all duration-300',
                isWin ? 'bg-bull shadow-md animate-pulse' : isLoss ? 'bg-bear shadow-md' : 'bg-fg-muted'
              )}
              title={`Live Price: ${livePrice}`}
            />

            {/* Profitable Region Shade */}
            {(() => {
              const entryPct = entry.side === 'long'
                ? ((entry.entry - entry.stop) / (entry.target - entry.stop)) * 100
                : ((entry.stop - entry.entry) / (entry.stop - entry.target)) * 100;
              const width = entry.side === 'long'
                ? sliderPosition - entryPct
                : entryPct - sliderPosition;
              const shadeLeft = entry.side === 'long'
                ? entryPct
                : sliderPosition;
              return (
                <div
                  style={{
                    left: `${Math.max(shadeLeft, 0)}%`,
                    width: `${Math.abs(Math.max(width, 0))}%`,
                  }}
                  className="absolute h-full bg-bull/10 rounded-r-full"
                />
              );
            })()}
          </div>
          <div className="flex justify-between items-center text-xs text-fg-muted font-semibold mt-0.5">
            <span className={sliderPosition < 0 ? 'text-bear font-bold' : ''}>
              {sliderPosition < 0 ? '✦ Beyond stop' : 'Stop Loss boundary'}
            </span>
            <span className={cn('font-bold', outcomeColor)}>Live Price: {livePrice}</span>
            <span className={sliderPosition > 100 ? 'text-bull font-bold' : ''}>
              {sliderPosition > 100 ? '✦ Beyond target' : 'Target boundary'}
            </span>
          </div>
        </div>
      )}

      {/* Manual close input stack */}
      {closing && (
        <div className="border-border flex flex-col gap-3 border-t pt-3">
          <div>
            <label
              className="text-fg-subtle text-caption font-bold uppercase tracking-wider"
              htmlFor={`exit-${entry.id}`}
            >
              Exit Price (Close Trade)
            </label>
            <Input
              id={`exit-${entry.id}`}
              value={exit}
              onChange={(ev) => setExit(ev.target.value)}
              inputMode="decimal"
              autoFocus
              className="mt-1.5 focus:border-border/70"
            />
            {error ? <p className="text-danger mt-2 text-xs font-semibold">{error}</p> : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="md"
              onClick={close}
              disabled={busy || !exit}
              className="flex-1"
            >Save</Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              onClick={() => {
                setClosing(false);
                setExit('');
                setError(null);
              }}
              disabled={busy}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function relative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
