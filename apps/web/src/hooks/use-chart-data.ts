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

// Unified chart data loading and prefetching hook.
// Combines candle series and technical indicators loading into a single synchronized request
// to prevent index misalignment/race conditions, and runs background prefetching for adjacent
// timeframes to enable instant zero-latency timeframe switching.

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Candle, IndicatorResult, Symbol, Timeframe } from '@hamafx/shared';
import { fetchCandles, fetchChartData, type IndicatorRequest } from '@/lib/market-client';
import { refetchIntervalFor } from '@/lib/datetime';

function getAdjacentTimeframes(tf: Timeframe): Timeframe[] {
  switch (tf) {
    case '1m':
      return ['5m'];
    case '5m':
      return ['1m', '15m'];
    case '15m':
      return ['5m', '30m'];
    case '30m':
      return ['15m', '1h'];
    case '1h':
      return ['30m', '4h'];
    case '4h':
      return ['1h', '1d'];
    case '1d':
      return ['4h', '1w'];
    case '1w':
      return ['1d'];
  }
}

export interface UseChartDataOptions {
  enabled?: boolean;
}

export interface ChartDataResult {
  candles: Candle[];
  indicatorResults: IndicatorResult[] | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useChartData(
  symbol: Symbol,
  tf: Timeframe,
  indicators: readonly IndicatorRequest[],
  count = 300,
  opts: UseChartDataOptions = {},
): ChartDataResult {
  const enabled = opts.enabled ?? true;
  const queryClient = useQueryClient();

  // Stable indicator representation for React Query key
  const indicatorsKey = useMemo(() => {
    if (indicators.length === 0) return '';
    return [...indicators]
      .map((i) => `${i.kind}:${JSON.stringify(i.params ?? {})}`)
      .sort()
      .join('|');
  }, [indicators]);

  // Unified Query Key
  const queryKey = useMemo(() => {
    if (indicators.length === 0) {
      return ['market', 'candles', symbol, tf, count];
    }
    return ['market', 'chartData', symbol, tf, count, indicatorsKey];
  }, [symbol, tf, count, indicators.length, indicatorsKey]);

  // Main synchronized query fetching
  const { data, isLoading, isFetching, error, refetch } = useQuery<{
    candles: Candle[];
    results: IndicatorResult[] | null;
  }>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (indicators.length === 0) {
        const candles = await fetchCandles(symbol, tf, count, { signal });
        return { candles, results: null };
      } else {
        const res = await fetchChartData(symbol, tf, indicators, count, { signal });
        return { candles: res.candles, results: res.results };
      }
    },
    enabled,
    refetchInterval: enabled ? refetchIntervalFor(tf) : false,
    refetchIntervalInBackground: false,
    staleTime: refetchIntervalFor(tf) / 2,
    // NOTE: retry:3 × 8s cap can stack retries and adjacent-TF prefetching when
    // a provider is flaky. The 2s prefetch debounce already mitigates this;
    // monitor connection saturation before raising these values (audit §5.2).
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // H5: Only depend on indicatorsKey, not the raw indicators array.
  // M5: Debounce adjacent timeframe prefetch by 2s — avoids racing on
  // rapid timeframe switches (user clicking 1m → 5m → 15m → 30m → 1h).
  // indicators intentionally omitted — we use indicatorsKey for stable identity.
  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      const adjacent = getAdjacentTimeframes(tf);
      for (const adjTf of adjacent) {
        const prefetchKey = indicators.length === 0
          ? ['market', 'candles', symbol, adjTf, count]
          : ['market', 'chartData', symbol, adjTf, count, indicatorsKey];

        // Skip prefetch if fresh data already exists in cache.
        const existing = queryClient.getQueryData(prefetchKey);
        if (existing !== undefined) continue;

        void queryClient.prefetchQuery({
          queryKey: prefetchKey,
          queryFn: async ({ signal }) => {
            if (indicators.length === 0) {
              const candles = await fetchCandles(symbol, adjTf, count, { signal });
              return { candles, results: null };
            } else {
              const res = await fetchChartData(symbol, adjTf, indicators, count, { signal });
              return { candles: res.candles, results: res.results };
            }
          },
          staleTime: refetchIntervalFor(adjTf) / 2,
        });
      }
    }, 2_000); // M5: 2s debounce

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, count, indicatorsKey, enabled, queryClient]);

  return {
    candles: data?.candles ?? [],
    indicatorResults: data?.results ?? null,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  };
}
