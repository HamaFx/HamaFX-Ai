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
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Adjacent Timeframes Background Prefetcher
  useEffect(() => {
    if (!enabled) return;

    const adjacent = getAdjacentTimeframes(tf);
    for (const adjTf of adjacent) {
      const prefetchKey = indicators.length === 0
        ? ['market', 'candles', symbol, adjTf, count]
        : ['market', 'chartData', symbol, adjTf, count, indicatorsKey];

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
  }, [symbol, tf, count, indicators, enabled, indicatorsKey, queryClient]);

  return {
    candles: data?.candles ?? [],
    indicatorResults: data?.results ?? null,
    isLoading,
    isFetching,
    error: error as Error | null,
    refetch,
  };
}
