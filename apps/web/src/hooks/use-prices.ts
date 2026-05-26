'use client';

// Polls /api/market/price for one or more symbols. The route handler caches
// at 3 s so two pollers per 3 s window collapse into a single upstream call.
//
// We use 1.5 s polling (same as docs/06-data-sources.md) when the tab is
// visible; TanStack Query auto-pauses when offline / hidden.
import type { Symbol, Tick } from '@hamafx/shared';
import { useQuery } from '@tanstack/react-query';

import { fetchPrices } from '@/lib/market-client';

const POLL_MS = 1_500;

export function usePrices(symbols: readonly Symbol[]) {
  // Stable key: sort so [XAU, EUR] and [EUR, XAU] hit the same cache entry.
  const key = [...symbols].sort();
  return useQuery<Tick[]>({
    queryKey: ['market', 'price', key],
    queryFn: ({ signal }) => fetchPrices(key, { signal }),
    enabled: symbols.length > 0,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 1_000,
  });
}

/** Convenience for a single symbol. */
export function usePrice(symbol: Symbol) {
  const q = usePrices([symbol]);
  const tick: Tick | undefined = q.data?.find((t) => t.symbol === symbol);
  return { ...q, tick };
}
