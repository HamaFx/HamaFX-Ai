'use client';

import type { Symbol, Timeframe } from '@hamafx/shared';
import { LineChart, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface ChartEmptyProps {
  symbol: Symbol;
  tf: Timeframe;
  onRetry: () => void;
}

export function ChartEmpty({ symbol, tf, onRetry }: ChartEmptyProps) {
  return (
    <div className="card-premium flex aspect-[16/9] w-full flex-col items-center justify-center gap-3.5 p-6 md:aspect-[21/9]">
      <span
        className="text-fg-subtle inline-flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: 'oklch(70% 0.02 265 / 0.1)' }}
      >
        <LineChart className="size-6" strokeWidth={1.75} />
      </span>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-fg text-sm font-semibold">No data available</p>
        <p className="text-fg-muted text-xs">
          No candles for {symbol} @ {tf}. Market may be closed.
        </p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}
