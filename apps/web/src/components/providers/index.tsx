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

// Single composition root for client-side providers. Order matters:
//   - NuqsAdapter must wrap anything that reads URL state via `useQueryState`.
//   - QueryClientProvider must wrap any data hooks.
//
// M7: Lazy-load SwRegister — it returns null and defers internally via
// requestIdleCallback. TimeProvider is kept synchronous because it wraps
// {children} and lazy-loading it would flash a blank app for ~50-200ms.
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import dynamic from 'next/dynamic';

import { QueryProvider } from './query-provider';
import { TimeProvider } from './time-provider';

const LazySwRegister = dynamic(
  () => import('./sw-register').then((m) => ({ default: m.SwRegister })),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <NuqsAdapter>
        <TimeProvider>
          <LazySwRegister />
          {children}
        </TimeProvider>
      </NuqsAdapter>
    </QueryProvider>
  );
}
