'use client';

// TanStack Query provider. Stable across navigations because the QueryClient
// lives in component state — see
// https://tanstack.com/query/latest/docs/framework/react/guides/ssr#using-the-app-directory
// for the rationale (one client per render = cache reset on every nav).
//
// Personal-mode defaults: aggressive polling for live data, no retries that
// would mask provider errors, garbage-collect after 5 min idle.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Each hook overrides these (e.g. usePrices polls at 1.5 s).
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // Provider errors are explicit; surface them rather than retry.
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: 0 },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
