// Bespoke renderer for the `compute_position_health` tool part.
//
// One row per open journal entry: pnl in pips + R, distance to stop /
// target, and an "about to hit" chip when ≤ 5 pips out. Empty state when
// no positions are open.

import Link from 'next/link';

import type { ToolPartProps } from './registry';

export function ComputePositionHealthPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'compute_position_health'>) {
  if (state === 'error') return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  if (state === 'loading' || !output) return <SkeletonCard />;

  if (output.empty) {
    return (
      <div className="border-border bg-bg-elev-1 text-fg-muted rounded-lg border p-3 text-sm">
        No open trades in the journal.
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-2 rounded-lg border p-3">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">Open positions</h3>
        <span className="text-fg-subtle font-mono text-[10px]">
          {new Date(output.asOf).toISOString().slice(11, 16)}Z
        </span>
      </header>

      <ul className="flex flex-col gap-1">
        {output.rows.map((r) => {
          const pnlTone =
            r.pnlPips > 0 ? 'text-bull' : r.pnlPips < 0 ? 'text-bear' : 'text-fg-muted';
          return (
            <li
              key={r.entryId}
              className="border-divider/40 flex flex-col gap-0.5 rounded-md border p-2 text-[11px] tabular-nums"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-fg font-semibold">
                  {r.side === 'long' ? '▲ Long' : '▼ Short'} {r.symbol}
                </span>
                <span className={pnlTone}>
                  {r.pnlPips >= 0 ? '+' : ''}
                  {r.pnlPips.toFixed(1)} pips
                  {r.pnlR !== null
                    ? ` · ${r.pnlR >= 0 ? '+' : ''}${r.pnlR.toFixed(2)}R`
                    : ''}
                </span>
              </div>
              <div className="text-fg-muted flex flex-wrap gap-x-3">
                <span>entry {r.entry.toFixed(5)}</span>
                <span>mid {r.currentMid.toFixed(5)}</span>
                {r.distanceToStopPips !== null ? (
                  <span>stop {r.distanceToStopPips.toFixed(1)}p away</span>
                ) : null}
                {r.distanceToTargetPips !== null ? (
                  <span>target {r.distanceToTargetPips.toFixed(1)}p away</span>
                ) : null}
                {r.aboutToHit ? (
                  <span className="bg-warn/15 text-warn rounded-full px-2 py-0.5 font-semibold">
                    About to hit
                  </span>
                ) : null}
                <Link
                  href={`/journal?id=${encodeURIComponent(r.entryId)}`}
                  className="text-brand ml-auto inline-flex hover:underline"
                >
                  open →
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      {output.partial ? (
        <p
          role="note"
          className="text-warn border-warn/30 bg-warn/5 rounded-md border px-2 py-1 text-[11px]"
        >
          One or more positions skipped due to a price-fetch failure.
        </p>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-lg border p-3"
      aria-busy="true"
      aria-label="Computing position health"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded" />
      <div className="bg-bg-elev-2 mt-3 h-16 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-bear/30 bg-bg-elev-1 text-bear rounded-lg border p-3 text-sm"
    >
      Position health failed{message ? ` · ${message}` : ''}
    </div>
  );
}
