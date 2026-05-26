'use client';

// Computes one or more indicators against the same candle window in a
// single round-trip. Pure derived data — refetch cadence matches candles.
import type { IndicatorResult, Symbol, Timeframe } from '@hamafx/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchIndicators, type IndicatorRequest } from '@/lib/market-client';

export function useIndicators(
  symbol: Symbol,
  tf: Timeframe,
  indicators: readonly IndicatorRequest[],
  count = 300,
) {
  // Stable key — order of indicators changes the request semantically.
  const key = indicators.map((i) => `${i.kind}:${JSON.stringify(i.params ?? {})}`).join('|');
  return useQuery<IndicatorResult[]>({
    queryKey: ['market', 'indicators', symbol, tf, count, key],
    queryFn: ({ signal }) => fetchIndicators(symbol, tf, indicators, count, { signal }),
    enabled: indicators.length > 0,
    staleTime: 30_000,
  });
}
