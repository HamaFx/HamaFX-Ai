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

import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SignalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-16 text-center">
      <span
        aria-hidden="true"
        className="text-danger bg-danger/10 inline-flex h-16 w-16 items-center justify-center rounded-sm"
      >
        <IconAlertTriangle className="size-8" />
      </span>
      <div className="flex max-w-xs flex-col gap-2">
        <p className="text-fg text-body font-semibold tracking-tight">Failed to load signals</p>
        <p className="text-fg-muted text-body-sm leading-[1.4]">
          Something went wrong while loading your signals data. Please try again.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="bg-fg text-bg hover:bg-fg-muted inline-flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-semibold transition-colors"
      >
        <IconRefresh className="size-4" />
        Try again
      </button>
    </div>
  );
}
