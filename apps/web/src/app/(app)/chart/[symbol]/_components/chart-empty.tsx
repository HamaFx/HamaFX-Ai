'use client';

import type { Symbol, Timeframe } from '@hamafx/shared';
import { LineChart, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

interface ChartEmptyProps {
  symbol: Symbol;
  tf: Timeframe;
  onRetry: () => void;
}

export function ChartEmpty({ symbol, tf, onRetry }: ChartEmptyProps) {
  return (
    <div className="aspect-[16/9] w-full md:aspect-[21/9]">
      <EmptyState
        tone="muted"
        icon={<LineChart className="size-7" strokeWidth={1.75} />}
        title="No data available"
        description={`No candles for ${symbol} @ ${tf}. Market may be closed.`}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            <RotateCcw className="size-4" /> Retry
          </Button>
        }
        className="h-full justify-center"
      />
    </div>
  );
}
