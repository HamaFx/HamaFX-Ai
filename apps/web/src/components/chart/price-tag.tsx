'use client';

// Live price readout for the chart header. Subscribes to the global price
// poller so multiple tags on the same page share one upstream call.
//
// The price digits animate via `<AnimatedNumber>` (motion spring) so live
// updates feel alive instead of snapping. Delta gets a TrendingUp/Down
// icon for at-a-glance direction.

import { priceDecimals, type Symbol } from '@hamafx/shared';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { AnimatedNumber } from '@/components/ui/animated-number';
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
      <AnimatedNumber
        value={tick.mid}
        decimals={decimals}
        className={cn(
          'text-base font-semibold tabular-nums',
          bull && 'text-bull',
          bear && 'text-bear',
        )}
      />
      {delta !== null ? (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-xs tabular-nums',
            bull && 'text-bull',
            bear && 'text-bear',
            !bull && !bear && 'text-fg-muted',
          )}
        >
          {bull ? <TrendingUp className="size-3" /> : bear ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(decimals)}
        </span>
      ) : null}
    </span>
  );
}
