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
