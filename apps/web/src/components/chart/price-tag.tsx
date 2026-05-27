'use client';

// Live price readout for the chart header. Subscribes to the global price
// poller so multiple tags on the same page share one upstream call.
import { priceDecimals, type Symbol } from '@hamafx/shared';

import { usePrice } from '@/hooks/use-prices';
import { cn } from '@/lib/cn';

interface PriceTagProps {
  symbol: Symbol;
  /**
   * Reference price used to render +/- delta and bull/bear colour.
   * Pass the prior close (e.g. previous bar's close) to show change-vs-open.
   */
  referencePrice?: number | null;
  className?: string;
}

export function PriceTag({ symbol, referencePrice, className }: PriceTagProps) {
  const { tick, isLoading, isError } = usePrice(symbol);
  const decimals = priceDecimals(symbol);

  if (isLoading) {
    return (
      <span className={cn('text-fg-subtle text-base tabular-nums animate-pulse', className)}>
        —
      </span>
    );
  }
  if (isError || !tick) {
    return (
      <span className={cn('text-bear text-xs tabular-nums', className)}>price unavailable</span>
    );
  }

  const delta = referencePrice != null ? tick.mid - referencePrice : null;
  const bull = delta !== null && delta > 0;
  const bear = delta !== null && delta < 0;

  return (
    <span className={cn('flex items-baseline gap-2', className)}>
      <span
        className={cn(
          'text-base font-semibold tabular-nums',
          bull && 'text-bull',
          bear && 'text-bear',
        )}
      >
        {tick.mid.toFixed(decimals)}
      </span>
      {delta !== null ? (
        <span
          className={cn(
            'text-xs tabular-nums',
            bull && 'text-bull',
            bear && 'text-bear',
            !bull && !bear && 'text-fg-muted',
          )}
        >
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(decimals)}
        </span>
      ) : null}
    </span>
  );
}
