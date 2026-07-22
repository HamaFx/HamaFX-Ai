// SPDX-License-Identifier: Apache-2.0

// Bespoke renderer for the `analyze_fundamental` tool part.
//
// Server component. Lists upcoming high-impact events for the symbol's
// currencies + a sentiment chip strip aggregated from recent news, with a
// deep link to the calendar filtered to the symbol.

import type { AnalyzeFundamentalOutput } from '@hamafx/shared';
import { Link } from 'next-view-transitions';

import type { ToolPartProps } from './registry';

const MAX_EVENTS = 6;

export function AnalyzeFundamentalPart({
  output,
  state,
  errorMessage,
}: ToolPartProps<'analyze_fundamental'>) {
  if (state === 'error') {
    return <ErrorCard message={errorMessage} />;
  }
  if (state === 'loading' || !output) {
    return <SkeletonCard />;
  }

  if (output.pipelinePending) {
    return (
      <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
        <p className="text-fg-muted text-sm">{output.summary}</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-elev-1 rounded-sm border p-3">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-fg text-sm font-semibold">
          {output.symbol} · fundamental
        </h3>
        <span className="text-fg-muted font-mono text-caption tabular-nums">
          {output.currencies.join(' · ')}
        </span>
      </header>

      <p className="text-fg-muted mb-3 text-xs leading-snug">{output.summary}</p>

      <SentimentStrip sentiment={output.sentiment} />

      {output.events.length === 0 ? (
        <p className="text-fg-muted mt-3 text-xs">No high-impact events in window.</p>
      ) : (
        <ul className="divide-border mt-3 divide-y">
          {output.events.slice(0, MAX_EVENTS).map((e) => {
            const iso = new Date(e.date).toISOString();
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex min-w-0 flex-col">
                  <span className="text-fg truncate text-xs font-medium">{e.title}</span>
                  <span className="text-fg-muted text-caption">
                    {e.country}
                    {e.currency ? ` · ${e.currency}` : ''} ·{' '}
                    <time dateTime={iso} className="tabular-nums">
                      {formatStamp(iso)}
                    </time>
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-sm px-2 py-0.5 text-caption font-medium uppercase tracking-wide ${impactClass(e.importance)}`}
                >
                  {e.importance}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={`/calendar?symbol=${output.symbol}`}
        className="text-fg focus-visible:ring-fg mt-3 block min-h-[24px] text-right text-body-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2"
      >
        open calendar →
      </Link>
    </div>
  );
}

function SentimentStrip({
  sentiment,
}: {
  sentiment: AnalyzeFundamentalOutput['sentiment'];
}) {
  const total = sentiment.positive + sentiment.negative + sentiment.neutral;
  if (total === 0) return null;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="flex items-center gap-2 text-caption tabular-nums">
      <span className="text-bull bg-bull/10 rounded-sm px-2 py-0.5 font-medium">
        ↑ {sentiment.positive} ({pct(sentiment.positive)}%)
      </span>
      <span className="text-bear bg-bear/10 rounded-sm px-2 py-0.5 font-medium">
        ↓ {sentiment.negative} ({pct(sentiment.negative)}%)
      </span>
      <span className="text-fg-muted bg-bg-elev-2 rounded-sm px-2 py-0.5 font-medium">
        · {sentiment.neutral} ({pct(sentiment.neutral)}%)
      </span>
    </div>
  );
}

function impactClass(importance: 'low' | 'medium' | 'high'): string {
  if (importance === 'high') return 'bg-danger/10 text-danger';
  if (importance === 'medium') return 'bg-warn/10 text-warn';
  return 'bg-bg-elev-2 text-fg-muted';
}

function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}Z`;
}

function SkeletonCard() {
  return (
    <div
      className="border-border bg-bg-elev-1 rounded-sm border p-3"
      aria-busy="true"
      aria-label="Analyzing fundamental backdrop"
    >
      <div className="bg-bg-elev-2 h-4 w-1/2 animate-pulse rounded-sm" />
      <div className="bg-bg-elev-2 mt-3 h-3 w-3/4 animate-pulse rounded-sm" />
      <ul className="mt-3 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="bg-bg-elev-2 h-8 animate-pulse rounded-sm" />
        ))}
      </ul>
    </div>
  );
}

function ErrorCard({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      className="border-danger/30 bg-bg-elev-1 text-danger rounded-sm border p-3 text-sm"
    >
      Fundamental analysis failed{message ? ` · ${message}` : ''}
    </div>
  );
}
