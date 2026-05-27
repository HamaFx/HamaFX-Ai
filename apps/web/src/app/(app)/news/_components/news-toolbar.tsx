'use client';

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
          className="bg-bg-elev-1/60 text-fg placeholder:text-fg-subtle focus:border-brand/60 border-divider h-11 w-full rounded-xl border pl-10 pr-10 text-sm focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQuery('')}
            className="text-fg-subtle hover:text-fg absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Sentiment chips */}
      <div
        role="radiogroup"
        aria-label="Filter by sentiment"
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
              onClick={() => onSentiment(s.value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                active
                  ? 'bg-brand text-brand-fg border-brand'
                  : 'border-divider bg-bg-elev-1/60 text-fg-muted hover:text-fg',
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
          className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
        >
          <SymbolChip label="All" active={symbol === 'all'} onClick={() => onSymbol('all')} />
          {symbolOptions.map((s) => (
            <SymbolChip
              key={s}
              label={s}
              active={symbol === s}
              onClick={() => onSymbol(s)}
            />
          ))}
        </div>
      ) : null}

      {/* Result count strip */}
      <p className="text-fg-subtle text-[11px] tabular-nums">
        Showing <span className="text-fg-muted font-semibold">{visibleCount}</span> of {totalCount}
      </p>
    </div>
  );
}

function SymbolChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[11px] font-semibold uppercase tabular-nums transition-colors',
        active
          ? 'bg-bg-elev-3 text-fg border-brand/50'
          : 'border-divider bg-bg-elev-1/60 text-fg-muted hover:text-fg',
      )}
    >
      {label}
    </button>
  );
}
