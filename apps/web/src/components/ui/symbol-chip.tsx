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

/**
 * <SymbolChip> — branded chip showing a single trading symbol
 * (XAUUSD / EURUSD / GBPUSD). Used by:
 *   - ChatTopBar to show the thread's pinned symbol
 *   - ChartView's toolbar to show the current symbol (with pin action)
 *
 * Two interaction modes:
 *   - read-only (default): the chip is just a label
 *   - removable (onClear): renders a small ✕ button visible on
 *     hover/tap; calls onClear when tapped
 *
 * Phase A — UX_UPGRADE_PLAN.md item 1.
 */

import type { Symbol } from '@hamafx/shared';
import { IconX } from '@tabler/icons-react';

import { cn } from '@/lib/cn';

export interface SymbolChipProps {
  symbol: Symbol;
  /** Optional clear handler. When provided, renders an ✕ affordance. */
  onClear?: () => void;
  /** Disable the clear button while a request is in flight. */
  clearing?: boolean;
  className?: string;
  /** Aria label for screen readers — defaults to the symbol. */
  'aria-label'?: string;
}

export function SymbolChip({
  symbol,
  onClear,
  clearing,
  className,
  'aria-label': ariaLabel,
}: SymbolChipProps) {
  const removable = typeof onClear === 'function';

  return (
    <span
      role={removable ? 'group' : undefined}
      aria-label={ariaLabel ?? symbol}
      className={cn(
        'bg-bg-elev-3 text-fg ring-zinc-700 inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-bold uppercase tabular-nums ring-1',
        className,
      )}
    >
      <span>{symbol}</span>
      {removable ? (
        <button
          type="button"
          onClick={onClear}
          disabled={clearing}
          aria-label={`Clear pinned symbol ${symbol}`}
          className={cn(
            'relative -mr-1 ml-0.5 inline-flex size-4 items-center justify-center rounded-sm transition-colors',
            'hover:bg-bg-elev-3 focus-visible:bg-fg/25 focus-visible:ring-2 focus-visible:ring-zinc-700 focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-60',
            'after:absolute after:left-1/2 after:top-1/2 after:size-[44px] after:-translate-x-1/2 after:-translate-y-1/2 after:content-[""]',
          )}
        >
          <IconX className="size-2.5" strokeWidth={3} />
        </button>
      ) : null}
    </span>
  );
}
