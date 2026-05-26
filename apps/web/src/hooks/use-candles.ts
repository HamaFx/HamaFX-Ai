'use client';

// Fetches and auto-refreshes the candle window for a (symbol, tf) pair.
// Refresh cadence is per-timeframe — the UI doesn't need to repaint a 1-day
// chart every 5 s, and we don't want to pay quota on it either.
import type { Candle, Symbol, Timeframe } from '@hamafx/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchCandles } from '@/lib/market-client';

/**
 * Refresh interval per timeframe. Mirrors the cache TTL on the server side
 * (docs/06-data-sources.md) — anything tighter just wastes calls.
 */
function refetchIntervalFor(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 5_000;
    case '5m':
    case '15m':
    case '30m':
    case '1h':
    case '4h':
      return 30_000;
    case '1d':
    case '1w':
      return 5 * 60_000;
  }
}

export function useCandles(symbol: Symbol, tf: Timeframe, count = 300) {
  return useQuery<Candle[]>({
    queryKey: ['market', 'candles', symbol, tf, count],
    queryFn: ({ signal }) => fetchCandles(symbol, tf, count, { signal }),
    refetchInterval: refetchIntervalFor(tf),
    refetchIntervalInBackground: false,
    staleTime: refetchIntervalFor(tf) / 2,
  });
}
