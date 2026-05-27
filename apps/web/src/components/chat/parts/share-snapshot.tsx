'use client';

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
    <div className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Snapshot ready</h3>
        <span className="text-fg-subtle text-[10px] tabular-nums">{formatExpiry(output.expiresAt)}</span>
      </header>

      <div className="flex items-stretch gap-2">
        <code className="border-border bg-bg-elev-2 text-fg-muted flex-1 truncate rounded border px-2 py-2 text-[11px]">
          {output.url}
        </code>
        <button
          type="button"
          onClick={() => copy(output.url)}
          aria-label="Copy share link"
          className="border-border bg-bg-elev-2 text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex h-11 min-w-[44px] items-center justify-center rounded-md border px-3 text-[11px] font-medium focus:outline-none focus-visible:ring-2"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

      <a
        href={output.url}
        target="_blank"
        rel="noreferrer"
        className="text-brand text-right text-[11px] font-medium underline-offset-2 hover:underline"
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
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Creating share link"
    >
      <div className="bg-bg-elev-2 h-4 w-1/3 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-9 w-full animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Share failed{message ? ` · ${message}` : ''}
    </div>
  );
}
