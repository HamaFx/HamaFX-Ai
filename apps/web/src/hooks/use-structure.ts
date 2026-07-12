'use client';

/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Fetches Smart Money Concepts events (swings, BOS/CHoCH, FVG, order
// blocks, liquidity sweeps) for the chart's current symbol+tf.
//
// Cadence intentionally lower than candles: structure events only change
// when bars close, so 30 s for intraday and 5 min for higher TFs is plenty.
// We also pass the candle count down so the result aligns 1:1 with what
// the chart's `useCandles` rendered.
import type { StructureKind, StructureResult, Symbol, Timeframe } from '@hamafx/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchStructure } from '@/lib/market-client';

/**
 * Structure data refreshes less frequently than candles — it only changes
 * when bars close, so 15-60 s for intraday and 5 min for higher TFs.
 */
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

export function useStructure(symbol: Symbol, tf: Timeframe, opts: UseStructureOptions = {}) {
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
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
