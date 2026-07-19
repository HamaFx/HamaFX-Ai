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

// Polls /api/market/price for one or more symbols. The route handler caches
// at 3 s so two pollers per 3 s window collapse into a single upstream call.
//
// We use 3 s polling when the tab is visible; TanStack Query auto-pauses
// when offline / hidden. (Phase 7 task 7.7 — aligned comment with actual
// POLL_MS value; docs/06-frontend.md updated to match.)
import { useMemo } from 'react';
import type { Symbol, Tick } from '@hamafx/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchPrices } from '@/lib/market-client';

const POLL_MS = 3_000;

export function usePrices(
  symbols: readonly Symbol[],
  options?: { enabled?: boolean },
) {
  // L1: memoize sorted key to avoid new array reference on every render.
  const key = useMemo(() => [...symbols].sort(), [symbols]);
  return useQuery<Tick[]>({
    queryKey: ['market', 'price', key],
    queryFn: ({ signal }) => fetchPrices(key, { signal }),
    enabled: (options?.enabled ?? true) && symbols.length > 0,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 2_000,
  });
}

/** Convenience for a single symbol. */
export function usePrice(
  symbol: Symbol,
  options?: { enabled?: boolean },
) {
  const q = usePrices([symbol], options);
  const tick: Tick | undefined = q.data?.find((t) => t.symbol === symbol);
  return { ...q, tick };
}
