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

// Per-segment error boundary for the (app) group. Keeps the chrome (top bar
// + bottom nav) intact while showing an inline failure card — better than
// the root error.tsx which hides everything.
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error('[app] segment error', error);
  }, [error]);

  return (
    <div className="border-danger/30 bg-danger/5 flex flex-col gap-3 rounded-sm border p-4" role="alert">
      <h1 className="text-danger text-base font-semibold">Couldn&apos;t load this page</h1>
      <p className="text-fg-muted text-sm">
        Something went wrong while rendering. Please try again.
      </p>
      <div>
        <Button type="button" onClick={() => reset()} size="sm" variant="secondary">
          Retry
        </Button>
      </div>
    </div>
  );
}
