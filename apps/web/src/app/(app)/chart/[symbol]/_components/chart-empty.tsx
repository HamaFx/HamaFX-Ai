'use client';

import type { Symbol, Timeframe } from '@hamafx/shared';

import { Button } from '@/components/ui/button';

interface ChartEmptyProps {
  symbol: Symbol;
  tf: Timeframe;
  onRetry: () => void;
}

export function ChartEmpty({ symbol, tf, onRetry }: ChartEmptyProps) {
  return (
    <div className="border-border bg-bg-elev-1 flex aspect-[16/9] w-full flex-col items-center justify-center gap-3 rounded-lg border md:aspect-[21/9]">
      <p className="text-fg-muted text-sm font-medium">No data available</p>
      <p className="text-fg-subtle text-xs">
        No candles returned for {symbol} @ {tf}. Market may be closed.
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
