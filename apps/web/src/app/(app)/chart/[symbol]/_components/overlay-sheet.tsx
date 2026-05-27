'use client';

// Bottom sheet hosting the SMC overlay toggles. Triggered from the chart
// header's gear icon — frees vertical space below the chart.

import type { StructureKind } from '@hamafx/shared';
import { Settings2, X } from 'lucide-react';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

const ALL_KINDS = ['swings', 'bos_choch', 'fvg', 'order_blocks', 'liquidity'] as const;
const LABEL: Record<StructureKind, string> = {
  swings: 'Swings',
  bos_choch: 'BOS / CHoCH',
  fvg: 'Fair Value Gaps',
  order_blocks: 'Order Blocks',
  liquidity: 'Liquidity sweeps',
};
const HINT: Record<StructureKind, string> = {
  swings: 'Local pivot highs/lows',
  bos_choch: 'Break of structure / change of character',
  fvg: '3-bar imbalance zones',
  order_blocks: 'Last opposing candle before impulse',
  liquidity: 'Wick spike + close-back-inside',
};

interface OverlaySheetProps {
  active: readonly StructureKind[];
  onToggle: (k: StructureKind) => void;
}

export function OverlaySheet({ active, onToggle }: OverlaySheetProps) {
  const enabledCount = active.length;
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={`Chart overlays${enabledCount > 0 ? ` (${enabledCount} active)` : ''}`}
          className={cn(
            'border-divider bg-bg-elev-2 inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-medium',
            'focus-visible:ring-brand focus:outline-none focus-visible:ring-2',
            enabledCount > 0 ? 'text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          <Settings2 className="size-4" />
          {enabledCount > 0 ? <span className="tabular-nums">{enabledCount}</span> : null}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <div>
            <DrawerTitle>Overlays</DrawerTitle>
            <DrawerDescription>Toggle Smart Money Concepts visualizations.</DrawerDescription>
          </div>
          <Tooltip label="Close">
            <DrawerClose
              className="text-fg-muted hover:text-fg inline-flex h-11 w-11 items-center justify-center rounded-md"
              aria-label="Close overlays sheet"
            >
              <X className="size-4" />
            </DrawerClose>
          </Tooltip>
        </DrawerHeader>
        <ul className="flex flex-col gap-1 px-2 pb-4">
          {ALL_KINDS.map((k) => {
            const on = active.includes(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => onToggle(k)}
                  aria-pressed={on}
                  className={cn(
                    'flex min-h-[56px] w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                    on ? 'bg-bg-elev-3' : 'hover:bg-bg-elev-1',
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-fg text-sm font-medium">{LABEL[k]}</span>
                    <span className="text-fg-subtle text-xs">{HINT[k]}</span>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors',
                      on ? 'bg-brand' : 'bg-bg-elev-3',
                    )}
                  >
                    <span
                      className={cn(
                        'bg-fg absolute h-5 w-5 rounded-full shadow-sm transition-all',
                        on ? 'left-[18px]' : 'left-[2px]',
                      )}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
