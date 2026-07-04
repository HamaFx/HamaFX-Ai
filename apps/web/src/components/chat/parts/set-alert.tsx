// Bespoke renderer for the `set_alert` tool part.
//
// The tool returns only an acknowledgement: `{ alertId, describes }`. The
// human-readable rule/symbol/threshold are already encoded in `describes`
// (e.g. "XAUUSD 1h close above 2400") by the tool itself, so this surface
// just confirms the rule was created and offers a deep link to the
// `/alerts` page filtered to the new id.
//
// Marked `"use client"` because the deep link uses `next/link` with
// `prefetch` to warm the alerts route cache as soon as the part renders —
// design called for a client component on this part.

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

import type { SetAlertOutput } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/cn';

interface SetAlertPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: SetAlertOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function SetAlertPart({ output, state, errorMessage }: SetAlertPartProps) {
  if (state === 'error') {
    return <SetAlertError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SetAlertSkeleton />;
  }

  const href = `/alerts?id=${encodeURIComponent(output.alertId)}`;

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-6">
          🔔
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-fg-muted text-xs">Alert created</div>
          <div className="text-fg mt-0.5 break-words text-sm font-medium">{output.describes}</div>
        </div>
      </div>
      <Link
        href={href}
        prefetch
        className={cn(
          'focus-visible:ring-fg mt-2 inline-flex min-h-[44px] min-w-[44px]',
          'items-center justify-center rounded-sm px-3 text-sm font-medium',
          'text-fg underline-offset-2 hover:underline',
          'focus-visible:outline-none focus-visible:ring-2',
        )}
      >
        View in Alerts →
      </Link>
    </div>
  );
}

function SetAlertSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Creating alert"
    >
      <div className="flex items-start gap-2">
        <div className="bg-bg-elev-2 h-5 w-5 animate-pulse rounded-sm" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="bg-bg-elev-2 h-3 w-24 animate-pulse rounded-sm" />
          <div className="bg-bg-elev-2 h-4 w-48 animate-pulse rounded-sm" />
        </div>
      </div>
      <div className="bg-bg-elev-2 mt-2 h-11 w-32 animate-pulse rounded-sm" />
    </div>
  );
}

function SetAlertError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-sm border p-3 text-sm"
    >
      Could not create alert{message ? ` · ${message}` : ''}
    </div>
  );
}
