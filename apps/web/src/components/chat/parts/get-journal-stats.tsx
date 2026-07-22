// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `get_journal_stats` tool part.
//
// Server component. Renders the global stats card + top-3 list per
// breakdown. Empty stats render a quiet "no trades" card.

import type { StatBreakdown } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

const TOP_N = 3;

export function GetJournalStatsPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'get_journal_stats'>) {
  if (state === 'error') {
    return <ErrorCard message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  const { stats, bySymbol, byTag } = output;

  if (stats.count === 0) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">No journal entries match the filter.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-3 rounded-sm border p-3">
      <header className="text-fg text-sm font-semibold">Journal stats</header>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-body-sm tabular-nums">
        <dt className="text-fg-subtle">count</dt>
        <dt className="text-fg-subtle">win rate</dt>
        <dt className="text-fg-subtle">avg R</dt>

        <dd className="text-fg font-semibold">{stats.count}</dd>
        <dd className={stats.winRate >= 0.5 ? 'text-bull font-semibold' : 'text-bear font-semibold'}>
          {Math.round(stats.winRate * 100)}%
        </dd>
        <dd className={stats.avgR >= 0 ? 'text-bull font-semibold' : 'text-bear font-semibold'}>
          {stats.avgR.toFixed(2)}R
        </dd>

        <dt className="text-fg-subtle">wins</dt>
        <dt className="text-fg-subtle">losses</dt>
        <dt className="text-fg-subtle">total R</dt>

        <dd className="text-bull">{stats.wins}</dd>
        <dd className="text-bear">{stats.losses}</dd>
        <dd className={stats.totalR >= 0 ? 'text-bull' : 'text-bear'}>
          {stats.totalR.toFixed(2)}R
        </dd>
      </dl>

      <BreakdownList title="By symbol" rows={bySymbol} hrefBuilder={(k) => `/journal?symbol=${k}`} />
      <BreakdownList title="By tag" rows={byTag} hrefBuilder={(k) => `/journal?tag=${encodeURIComponent(k)}`} />
    </div>
  );
}

function BreakdownList({
  title,
  rows,
  hrefBuilder,
}: {
  title: string;
  rows: StatBreakdown[];
  hrefBuilder: (key: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h4 className="text-fg-muted mb-1 text-body-sm uppercase tracking-wide">{title}</h4>
      <ul className="divide-border divide-y">
        {rows.slice(0, TOP_N).map((r) => (
          <li key={r.key}>
            <Link
              href={hrefBuilder(r.key)}
              className="focus-visible:ring-fg-muted grid min-h-[36px] grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-1.5 text-body-sm tabular-nums outline-none focus-visible:ring-2"
            >
              <span className="text-fg truncate font-medium">{r.key}</span>
              <span className="text-fg-muted">{r.count}</span>
              <span className={r.winRate >= 0.5 ? 'text-bull' : 'text-bear'}>
                {Math.round(r.winRate * 100)}%
              </span>
              <span className={r.avgR >= 0 ? 'text-bull' : 'text-bear'}>
                {r.avgR.toFixed(2)}R
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing journal stats"
    >
      <div className="bg-bg-elev-2 h-4 w-1/3 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-16 animate-pulse rounded-sm" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Journal stats failed{message ? ` · ${message}` : ''}
    </div>
  );
}
