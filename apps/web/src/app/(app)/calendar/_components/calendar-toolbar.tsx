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

// Calendar toolbar — importance + currency filters + "show past" toggle.

import type { EventCurrency, Importance } from '@hamafx/shared';

import { cn } from '@/lib/cn';
import { handleRadioKeyDown } from '@/lib/datetime';

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
  { value: 'high', label: 'High', glyph: '▲', tone: 'text-danger' },
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
        onKeyDown={handleRadioKeyDown}
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
              tabIndex={active ? 0 : -1}
              onClick={() => onImportance(opt.value)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors',
                active
                  ? 'bg-fg text-black border-border'
                  : 'border-border bg-bg-elev-1/60 text-fg-muted hover:text-fg',
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
          onKeyDown={handleRadioKeyDown}
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
                tabIndex={active ? 0 : -1}
                onClick={() => onCurrency(c.value)}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center rounded-sm border px-3 text-body-sm font-semibold uppercase tabular-nums transition-colors',
                  active
                    ? 'bg-bg-elev-3 text-fg border-border'
                    : 'border-border bg-bg-elev-1/60 text-fg-muted hover:text-fg',
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
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-body-sm font-semibold transition-colors',
            showPast
              ? 'bg-bg-elev-3 text-fg border-border'
              : 'border-border bg-bg-elev-1/60 text-fg-muted hover:text-fg',
          )}
        >
          {showPast ? 'Hide past' : 'Show past'}
        </button>
      </div>

      <p className="text-fg-subtle text-body-sm tabular-nums">
        Showing <span className="text-fg-muted font-semibold">{visibleCount}</span> of{' '}
        {totalCount}
      </p>
    </div>
  );
}
