'use client';

// Calendar toolbar — importance + currency filters + "show past" toggle.

import type { EventCurrency, Importance } from '@hamafx/shared';

import { cn } from '@/lib/cn';

export type ImportanceFilter = Importance | 'all';
export type CurrencyFilter = EventCurrency | 'all';

interface CalendarToolbarProps {
  importance: ImportanceFilter;
  onImportance: (v: ImportanceFilter) => void;
  currency: CurrencyFilter;
  onCurrency: (v: CurrencyFilter) => void;
  showPast: boolean;
  onShowPast: (v: boolean) => void;
  visibleCount: number;
  totalCount: number;
}

const IMPORTANCE: Array<{
  value: ImportanceFilter;
  label: string;
  glyph: string;
  tone: string;
}> = [
  { value: 'all', label: 'All', glyph: '·', tone: 'text-fg' },
  { value: 'high', label: 'High', glyph: '▲', tone: 'text-bear' },
  { value: 'medium', label: 'Medium', glyph: '■', tone: 'text-warn' },
  { value: 'low', label: 'Low', glyph: '•', tone: 'text-fg-subtle' },
];

const CURRENCIES: Array<{ value: CurrencyFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
];

export function CalendarToolbar({
  importance,
  onImportance,
  currency,
  onCurrency,
  showPast,
  onShowPast,
  visibleCount,
  totalCount,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Importance row */}
      <div
        role="radiogroup"
        aria-label="Filter by importance"
        className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
      >
        {IMPORTANCE.map((opt) => {
          const active = opt.value === importance;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onImportance(opt.value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                active
                  ? 'bg-brand text-brand-fg border-brand'
                  : 'border-divider bg-bg-elev-1/60 text-fg-muted hover:text-fg',
              )}
            >
              <span aria-hidden className={active ? '' : opt.tone}>
                {opt.glyph}
              </span>
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Currency row + show-past toggle */}
      <div className="flex items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="Filter by currency"
          className="scrollbar-hide flex flex-1 gap-2 overflow-x-auto"
        >
          {CURRENCIES.map((c) => {
            const active = c.value === currency;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onCurrency(c.value)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[11px] font-semibold uppercase tabular-nums transition-colors',
                  active
                    ? 'bg-bg-elev-3 text-fg border-brand/50'
                    : 'border-divider bg-bg-elev-1/60 text-fg-muted hover:text-fg',
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onShowPast(!showPast)}
          aria-pressed={showPast}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors',
            showPast
              ? 'bg-bg-elev-3 text-fg border-brand/50'
              : 'border-divider bg-bg-elev-1/60 text-fg-muted hover:text-fg',
          )}
        >
          {showPast ? 'Hide past' : 'Show past'}
        </button>
      </div>

      <p className="text-fg-subtle text-[11px] tabular-nums">
        Showing <span className="text-fg-muted font-semibold">{visibleCount}</span> of{' '}
        {totalCount}
      </p>
    </div>
  );
}
