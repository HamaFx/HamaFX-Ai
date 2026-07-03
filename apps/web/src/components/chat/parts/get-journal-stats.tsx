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
    return <ErrorCard {...(errorMessage ? { message: errorMessage } : {})} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  const { stats, bySymbol, byTag } = output;

  if (stats.count === 0) {
    return (
      <div className="border-border bg-zinc-950 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">No journal entries match the filter.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-zinc-950 flex flex-col gap-3 rounded-sm border p-3">
      <header className="text-fg text-sm font-semibold">Journal stats</header>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-body-sm tabular-nums">
        <dt className="text-fg-subtle">count</dt>
        <dt className="text-fg-subtle">win rate</dt>
        <dt className="text-fg-subtle">avg R</dt>

        <dd className="text-fg font-semibold">{stats.count}</dd>
        <dd className={stats.winRate >= 0.5 ? 'text-emerald-500 font-semibold' : 'text-red-500 font-semibold'}>
          {Math.round(stats.winRate * 100)}%
        </dd>
        <dd className={stats.avgR >= 0 ? 'text-emerald-500 font-semibold' : 'text-red-500 font-semibold'}>
          {stats.avgR.toFixed(2)}R
        </dd>

        <dt className="text-fg-subtle">wins</dt>
        <dt className="text-fg-subtle">losses</dt>
        <dt className="text-fg-subtle">total R</dt>

        <dd className="text-emerald-500">{stats.wins}</dd>
        <dd className="text-red-500">{stats.losses}</dd>
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
      className="border-border bg-zinc-950 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Computing journal stats"
    >
      <div className="bg-zinc-900 h-4 w-1/3 animate-pulse rounded" />
      <div className="bg-zinc-900 mt-3 h-16 animate-pulse rounded" />
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-red-500/30 bg-zinc-950 text-red-500 rounded-sm border p-3 text-sm"
    >
      Journal stats failed{message ? ` · ${message}` : ''}
    </div>
  );
}
