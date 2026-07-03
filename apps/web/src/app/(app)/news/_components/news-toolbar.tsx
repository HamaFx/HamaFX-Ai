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

// News page toolbar — search + sentiment filter + symbol filter, all
// sticky under the page header. Mobile-first: chip rails scroll
// horizontally so we never wrap onto two rows on narrow screens.

import type { NewsSentiment, SymbolOrCurrencyTag } from '@hamafx/shared';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';

export type SentimentFilter = NewsSentiment | 'all';
export type SymbolFilter = SymbolOrCurrencyTag | 'all';

interface NewsToolbarProps {
  query: string;
  onQuery: (q: string) => void;
  sentiment: SentimentFilter;
  onSentiment: (s: SentimentFilter) => void;
  symbol: SymbolFilter;
  onSymbol: (s: SymbolFilter) => void;
  /** Distinct symbol/currency tags present in the loaded set. */
  symbolOptions: readonly SymbolOrCurrencyTag[];
  /** Count of articles passing the current filter (for the empty-state pill). */
  visibleCount: number;
  totalCount: number;
}

const SENTIMENTS: Array<{ value: SentimentFilter; label: string; tone: string }> = [
  { value: 'all', label: 'All', tone: 'text-fg' },
  { value: 'positive', label: 'Bullish', tone: 'text-bull' },
  { value: 'negative', label: 'Bearish', tone: 'text-bear' },
  { value: 'neutral', label: 'Neutral', tone: 'text-fg-muted' },
];

function handleRadioKeyDown(e: React.KeyboardEvent) {
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  const currentIdx = radios.findIndex(r => r === document.activeElement);
  if (currentIdx === -1) return;
  let nextIdx: number;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    nextIdx = (currentIdx + 1) % radios.length;
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    nextIdx = (currentIdx - 1 + radios.length) % radios.length;
  } else {
    return;
  }
  radios[nextIdx]?.focus();
  radios[nextIdx]?.click();
}

export function NewsToolbar({
  query,
  onQuery,
  sentiment,
  onSentiment,
  symbol,
  onSymbol,
  symbolOptions,
  visibleCount,
  totalCount,
}: NewsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-fg-subtle absolute left-3 top-1/2 size-4 -translate-y-1/2"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search headlines…"
          aria-label="Search headlines"
          className="bg-zinc-950/60 text-fg placeholder:text-fg-subtle focus:border-zinc-700 border-zinc-800 h-11 w-full rounded-sm border pl-10 pr-10 text-sm focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery('')}
            className="text-fg-subtle hover:text-fg absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm transition-colors"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Sentiment chips */}
      <div
        role="radiogroup"
        aria-label="Filter by sentiment"
        onKeyDown={handleRadioKeyDown}
        className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
      >
        {SENTIMENTS.map((s) => {
          const active = s.value === sentiment;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSentiment(s.value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors',
                active
                  ? 'bg-fg text-black border-zinc-700'
                  : 'border-zinc-800 bg-zinc-950/60 text-fg-muted hover:text-fg',
              )}
            >
              <span aria-hidden="true" className={cn(active ? '' : s.tone)}>
                {s.label === 'Bullish' ? '▲' : s.label === 'Bearish' ? '▼' : '·'}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Symbol chips — only render when we have at least one tag */}
      {symbolOptions.length > 0 ? (
        <div
          role="radiogroup"
          aria-label="Filter by symbol"
          onKeyDown={handleRadioKeyDown}
          className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
        >
          <SymbolChip label="All" active={symbol === 'all'} tabIndex={symbol === 'all' ? 0 : -1} onClick={() => onSymbol('all')} />
          {symbolOptions.map((s) => (
            <SymbolChip
              key={s}
              label={s}
              active={symbol === s}
              tabIndex={symbol === s ? 0 : -1}
              onClick={() => onSymbol(s)}
            />
          ))}
        </div>
      ) : null}

      {/* Result count strip */}
      <p className="text-fg-subtle text-body-sm tabular-nums">
        Showing <span className="text-fg-muted font-semibold">{visibleCount}</span> of {totalCount}
      </p>
    </div>
  );
}

function SymbolChip({
  label,
  active,
  tabIndex,
  onClick,
}: {
  label: string;
  active: boolean;
  tabIndex?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={tabIndex ?? -1}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-sm border px-3 text-body-sm font-semibold uppercase tabular-nums transition-colors',
        active
          ? 'bg-zinc-800 text-fg border-zinc-700'
          : 'border-zinc-800 bg-zinc-950/60 text-fg-muted hover:text-fg',
      )}
    >
      {label}
    </button>
  );
}
