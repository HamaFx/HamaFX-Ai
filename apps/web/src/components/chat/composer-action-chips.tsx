// SPDX-License-Identifier: Apache-2.0

'use client';

import { useMemo } from 'react';
import type { Symbol } from '@kestrel/shared';
import {
  IconActivity,
  IconChartBar,
  IconChartLine,
  IconNews,
  IconShieldCheck,
  IconTarget,
} from '@tabler/icons-react';

import { cn } from '@/lib/cn';

interface ActionChip {
  id: string;
  label: string;
  icon: typeof IconChartBar;
  prompt: string;
}

interface ComposerActionChipsProps {
  pinnedSymbol?: Symbol | null;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function ComposerActionChips({
  pinnedSymbol,
  onSelect,
  disabled,
}: ComposerActionChipsProps) {
  const symbol = pinnedSymbol ?? 'XAUUSD';

  const chips: ActionChip[] = useMemo(
    () => [
      {
        id: 'order-flow',
        label: '15m Order Flow',
        icon: IconActivity,
        prompt: `Analyze 15m order flow, fair value gaps, and current market structure for ${symbol}`,
      },
      {
        id: 'liquidity',
        label: 'Key Liquidity Pools',
        icon: IconTarget,
        prompt: `Where are the key buy-side and sell-side liquidity pools for ${symbol} right now?`,
      },
      {
        id: 'confluence',
        label: 'Top-Down 4H→15M',
        icon: IconChartLine,
        prompt: `Give a multi-timeframe top-down confluence breakdown for ${symbol} (4H -> 1H -> 15M)`,
      },
      {
        id: 'macro-news',
        label: 'News Impact',
        icon: IconNews,
        prompt: `What high-impact economic events and news releases are affecting ${symbol} today?`,
      },
      {
        id: 'fvg-map',
        label: 'FVG & Imbalances',
        icon: IconChartBar,
        prompt: `Map all active 15m and 1h Fair Value Gaps and imbalance zones for ${symbol}`,
      },
      {
        id: 'risk-check',
        label: 'Risk & Invalidation',
        icon: IconShieldCheck,
        prompt: `What is the logical stop loss placement and trade invalidation level for ${symbol}?`,
      },
    ],
    [symbol],
  );

  return (
    <div className="w-full overflow-x-auto scrollbar-hide py-1.5 flex items-center gap-1.5 select-none">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(chip.prompt)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-medium shrink-0 transition-all border',
              'border-border/70 bg-bg-elev-1/80 text-fg-subtle hover:text-fg hover:border-brand/50 hover:bg-bg-elev-2 active:scale-95',
              'disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-1 focus-visible:ring-brand',
            )}
            title={chip.prompt}
          >
            <Icon className="size-3.5 text-brand shrink-0" />
            <span className="whitespace-nowrap">{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
}
