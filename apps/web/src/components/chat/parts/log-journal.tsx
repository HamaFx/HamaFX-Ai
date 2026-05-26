// Bespoke renderer for the `log_journal` tool part.
//
// The tool returns an acknowledgement envelope only — `{ entryId, summary }`
// where `summary` is the canonical line the assistant echoes back (e.g.
// "short XAUUSD @ 2392 SL 2398 TP 2378"). The parsed entry fields
// (side / symbol / entry / stop / takeProfit) live on the persisted row,
// not in the tool output, so we can't compute the R-multiple here without
// re-fetching the entry. Surfacing R-multiple in the chat card is a
// follow-up that needs `LogJournalOutputSchema` extended to carry the
// parsed fields (or to embed `JournalEntrySchema` directly).
//
// For now: confirm the entry was saved, echo the canonical summary line,
// and provide a deep link to `/journal?id=<entryId>` so the full row
// (with computed R-multiple in the journal view) is one tap away.
//
// Server component on purpose — no state, no events, no browser-only APIs.

import type { LogJournalOutput } from '@hamafx/shared';
import Link from 'next/link';

interface LogJournalPartProps {
  /** Tool output, or `null` while streaming / before completion. */
  output: LogJournalOutput | null;
  state: 'loading' | 'done' | 'error';
  errorMessage?: string;
}

export function LogJournalPart({ output, state, errorMessage }: LogJournalPartProps) {
  if (state === 'error') {
    return <LogJournalError {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <LogJournalSkeleton />;
  }

  return (
    <div className="border-border bg-bg-elev-1 rounded-lg border p-3">
      <div className="text-fg-muted mb-1 text-xs">Journal entry saved</div>
      <p className="text-fg mb-2 text-sm font-medium">{output.summary}</p>
      <Link
        href={`/journal?id=${encodeURIComponent(output.entryId)}`}
        className="text-brand focus-visible:ring-brand inline-flex min-h-[44px] min-w-[44px] items-center text-sm underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2"
      >
        View in journal →
      </Link>
    </div>
  );
}

function LogJournalSkeleton() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Saving journal entry"
    >
      <div className="bg-bg-elev-2 mb-2 h-3 w-32 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mb-2 h-4 w-3/4 animate-pulse rounded" />
      <div className="bg-bg-elev-2 h-4 w-24 animate-pulse rounded" />
    </div>
  );
}

function LogJournalError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Could not save journal entry{message ? ` · ${message}` : ''}
    </div>
  );
}
