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

// Bespoke renderer for the `share_snapshot` tool part.
//
// Client component because we need a copy-to-clipboard action. Layout
// stays minimal — a one-line title + the copyable URL + an expiry hint.

import { useState } from 'react';

import type { ToolPartProps } from './registry';

export function ShareSnapshotPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'share_snapshot'>) {
  const [copied, setCopied] = useState(false);

  if (state === 'error') {
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-zinc-950 flex flex-col gap-2 rounded-sm border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Snapshot ready</h3>
        <span className="text-fg-subtle text-caption tabular-nums">{formatExpiry(output.expiresAt)}</span>
      </header>

      <div className="flex items-stretch gap-2">
        <code className="border-border bg-zinc-900 text-fg-muted flex-1 truncate rounded border px-2 py-2 text-body-sm">
          {output.url}
        </code>
        <button
          type="button"
          onClick={() => copy(output.url)}
          aria-label="Copy share link"
          className="border-border bg-zinc-900 text-fg-muted hover:text-fg focus-visible:ring-fg inline-flex h-11 min-w-[44px] items-center justify-center rounded-sm border px-3 text-body-sm font-medium focus:outline-none focus-visible:ring-2"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

      <a
        href={output.url}
        target="_blank"
        rel="noreferrer"
        className="text-fg text-right text-body-sm font-medium underline-offset-2 hover:underline"
      >
        open in new tab →
      </a>
    </div>
  );
}

function formatExpiry(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return 'expired';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `expires in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `expires in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `expires in ${days}d`;
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-zinc-950 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Creating share link"
    >
      <div className="bg-zinc-900 h-4 w-1/3 animate-pulse rounded" />
      <div className="bg-zinc-900 mt-3 h-9 w-full animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-red-500/30 bg-zinc-950 text-red-500 rounded-sm border p-3 text-sm"
    >
      Share failed{message ? ` · ${message}` : ''}
    </div>
  );
}
