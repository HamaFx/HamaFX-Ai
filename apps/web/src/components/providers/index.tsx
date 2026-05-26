'use client';

// Single composition root for client-side providers. Order matters:
//   - NuqsAdapter must wrap anything that reads URL state via `useQueryState`.
//   - QueryClientProvider must wrap any data hooks.

import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { QueryProvider } from './query-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <QueryProvider>{children}</QueryProvider>
    </NuqsAdapter>
  );
}
