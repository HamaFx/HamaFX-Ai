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

// Fetches and auto-refreshes the candle window for a (symbol, tf) pair.
// Refresh cadence is per-timeframe — the UI doesn't need to repaint a 1-day
// chart every 5 s, and we don't want to pay quota on it either.
//
// Phase 3 hardening §8 — the hook now accepts an `enabled` flag so a
// chart that's mounted but offscreen (in a tab, behind a drawer,
// scrolled past) stops polling. Pair with an `IntersectionObserver`
// in the consumer.

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

export interface UseCandlesOptions {
  /**
   * When false, the hook keeps the cached value but stops the polling
   * timer. Useful when the chart is offscreen — pair with an
   * `IntersectionObserver` (`{ enabled: visible }`).
   */
  enabled?: boolean;
}

export function useCandles(
  symbol: Symbol,
  tf: Timeframe,
  count = 300,
  opts: UseCandlesOptions = {},
) {
  const enabled = opts.enabled ?? true;
  return useQuery<Candle[]>({
    queryKey: ['market', 'candles', symbol, tf, count],
    queryFn: ({ signal }) => fetchCandles(symbol, tf, count, { signal }),
    enabled,
    // `false` here AND `enabled: false` together stop polling completely.
    // Setting just `enabled: false` would also block the initial fetch;
    // we want the hook to fetch once when first enabled, then only
    // refetch while visible.
    refetchInterval: enabled ? refetchIntervalFor(tf) : false,
    refetchIntervalInBackground: false,
    staleTime: refetchIntervalFor(tf) / 2,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
