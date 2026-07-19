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
import {IconSearch, IconAdjustmentsHorizontal, IconCompass} from '@tabler/icons-react';
import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { useConfirm } from '@/components/ui/confirm-drawer';
import { usePrices } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';
import { EntryRow } from './entry-row';

interface EntryListProps {
  entries: JournalEntry[];
  onClosed: () => void;
  onDeleted: () => void;
}

export type ConfirmFn = ReturnType<typeof useConfirm>[1];

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
