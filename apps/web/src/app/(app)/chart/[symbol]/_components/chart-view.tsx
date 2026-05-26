'use client';

// Client orchestration for the chart page. The route file stays a server
// component (so it can do `notFound()` based on the symbol) and delegates
// the interactive surface to this component.

import { useMemo } from 'react';

import type { Symbol } from '@hamafx/shared';

import { Chart } from '@/components/chart/chart';
import { PriceTag } from '@/components/chart/price-tag';
import { SymbolPicker } from '@/components/chart/symbol-picker';
import { TimeframePicker } from '@/components/chart/timeframe-picker';
import { useCandles } from '@/hooks/use-candles';
import { useTimeframe } from '@/hooks/use-tf';

export function ChartView({ symbol }: { symbol: Symbol }) {
  const [tf, setTf] = useTimeframe();
  const { data: candles } = useCandles(symbol, tf);

  // Reference price = previous closed bar's close. The most recent bar may
  // still be in progress, so we use index `-2` when available.
  const referenceClose = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    return candles.at(-2)?.c ?? null;
  }, [candles]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SymbolPicker active={symbol} />
          <PriceTag symbol={symbol} referencePrice={referenceClose} />
        </div>
        <TimeframePicker value={tf} onChange={setTf} />
      </header>

      <Chart symbol={symbol} tf={tf} />

      <p className="text-fg-subtle text-[11px]">
        Polling at 1.5 s for price, {tf} candles refresh per server cache TTL. Source: Twelve
        Data (primary).
      </p>
    </div>
  );
}
