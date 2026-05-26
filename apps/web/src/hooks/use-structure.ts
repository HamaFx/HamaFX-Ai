'use client';

// Fetches Smart Money Concepts events (swings, BOS/CHoCH, FVG, order
// blocks, liquidity sweeps) for the chart's current symbol+tf.
//
// Cadence intentionally lower than candles: structure events only change
// when bars close, so 30 s for intraday and 5 min for higher TFs is plenty.
// We also pass the candle count down so the result aligns 1:1 with what
// the chart's `useCandles` rendered.

import { useQuery } from '@tanstack/react-query';

import type { StructureKind, StructureResult, Symbol, Timeframe } from '@hamafx/shared';

import { fetchStructure } from '@/lib/market-client';

function refetchIntervalFor(tf: Timeframe): number {
  switch (tf) {
    case '1m':
    case '5m':
      return 15_000;
    case '15m':
    case '30m':
    case '1h':
    case '4h':
      return 60_000;
    case '1d':
    case '1w':
      return 5 * 60_000;
  }
}

export interface UseStructureOptions {
  count?: number;
  kinds?: readonly StructureKind[];
  lookback?: number;
  enabled?: boolean;
}

export function useStructure(
  symbol: Symbol,
  tf: Timeframe,
  opts: UseStructureOptions = {},
) {
  const count = opts.count ?? 300;
  const lookback = opts.lookback ?? 3;
  // Stable key — order of kinds matters for the cache identity.
  const kindsKey = opts.kinds ? [...opts.kinds].sort().join(',') : 'all';

  return useQuery<StructureResult>({
    queryKey: ['market', 'structure', symbol, tf, count, lookback, kindsKey],
    queryFn: ({ signal }) =>
      fetchStructure(symbol, tf, {
        count,
        lookback,
        ...(opts.kinds ? { kinds: opts.kinds } : {}),
        ...(signal ? { signal } : {}),
      }),
    enabled: opts.enabled !== false,
    refetchInterval: refetchIntervalFor(tf),
    refetchIntervalInBackground: false,
    staleTime: refetchIntervalFor(tf) / 2,
  });
}
