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
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { Link } from 'next-view-transitions';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="bg-bg-elev-1 text-fg flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-sm"
        style={{
          background: 'none',
                  }}
      >
        <span className="text-fg text-2xl font-bold">H</span>
      </span>
      <div className="flex flex-col gap-2 text-center items-center" role="alert">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-fg-muted text-sm max-w-sm">
          A stop-loss kicked in. Please try again.
        </p>
      </div>
      <div className="flex gap-3">
        <Button type="button" onClick={() => reset()} size="sm">
          Try again
        </Button>
        <Link
          href="/chat"
          className="border border-border bg-bg-elev-1 text-fg hover:bg-bg-elev-2 inline-flex h-9 items-center justify-center rounded-sm px-4 text-sm font-medium transition-colors"
        >
          Go to chat
        </Link>
      </div>
    </main>
  );
}
