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

// Root error boundary. Next.js renders this when any non-recoverable error
// surfaces during rendering. We log + show a recover button so the user
// isn't stuck on a blank screen.
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[app] uncaught render error', error);
  }, [error]);

  return (
    <main className="bg-bg text-fg flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">Something broke.</h1>
        <p className="text-fg-muted text-sm">
          {error.message || 'An unexpected error occurred while rendering the page.'}
        </p>
        {error.digest ? (
          <p className="text-fg-subtle text-[10px] tabular-nums">digest: {error.digest}</p>
        ) : null}
      </div>
      <Button type="button" onClick={() => reset()} size="sm">
        Try again
      </Button>
    </main>
  );
}
