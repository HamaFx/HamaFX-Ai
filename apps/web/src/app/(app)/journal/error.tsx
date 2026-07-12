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

// Phase 7 task 7.8 — scoped error boundary for the journal view.
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

import { Button } from '@/components/ui/button';

interface JournalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function JournalError({ error, reset }: JournalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      className="border-danger/30 bg-danger/5 flex flex-col gap-3 rounded-sm border p-4"
      role="alert"
    >
      <h1 className="text-danger text-base font-semibold">Journal unavailable</h1>
      <p className="text-fg-muted text-sm">
        Something went wrong while loading the journal. Please try again.
      </p>
      <div>
        <Button type="button" onClick={() => reset()} size="sm" variant="secondary">
          Retry
        </Button>
      </div>
    </div>
  );
}
