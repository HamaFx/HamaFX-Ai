// SPDX-License-Identifier: Apache-2.0

// Sentiment overview at the top of /news. Shows the proportional split
// of positive/negative/neutral headlines as a horizontal stacked bar.
//
// Feels like a market-pulse strip at a glance — green-heavy = market is
// reading the news bullishly, red-heavy = bearishly. Counts shown to
// the right so the bar isn't the only signal.
//
// Server component — purely derived from the article list, no state.

import type { NewsArticle } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface SentimentSummaryProps {
  articles: readonly NewsArticle[];
}

export function SentimentSummary({ articles }: SentimentSummaryProps) {
  const counts = { positive: 0, negative: 0, neutral: 0, none: 0 };
  for (const a of articles) {
    if (a.sentiment === 'positive') counts.positive += 1;
    else if (a.sentiment === 'negative') counts.negative += 1;
    else if (a.sentiment === 'neutral') counts.neutral += 1;
    else counts.none += 1;
  }
  const total = articles.length;
  const pct = (n: number) => (total > 0 ? Math.max(0, (n / total) * 100) : 0);

  // Calculate and clamp sentiment score to [-1, 1]
  const rawScore = total > 0 ? (counts.positive - counts.negative) / total : 0;
  const score = Math.max(-1, Math.min(1, rawScore));

  const leanLabel =
    score > 0.15
      ? 'Bullish'
      : score < -0.15
        ? 'Bearish'
        : 'Neutral';
  const leanTone = score > 0.15 ? 'text-bull' : score < -0.15 ? 'text-bear' : 'text-fg-muted';

  return (
    <section
      aria-labelledby="news-pulse-heading"
      className="border border-border bg-bg-elev-1 rounded-sm relative flex flex-col gap-3 p-4"
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2
            id="news-pulse-heading"
            className="text-fg-subtle text-caption font-semibold uppercase tracking-wider"
          >
            News pulse
          </h2>
          <p className="text-fg text-base font-bold tabular-nums">
            {total} <span className="text-fg-muted text-sm font-normal">headlines</span>
          </p>
        </div>
        <span
          className={cn('text-body-sm font-semibold uppercase tracking-wide', leanTone)}
        >
          {leanLabel}
        </span>
      </header>

      {/* Stacked sentiment bar */}
      <div className="bg-bg-elev-2 flex h-2 w-full overflow-hidden rounded-sm">
        {counts.positive > 0 ? (
          <span
            className="bg-bull h-full"
            style={{ width: `${pct(counts.positive)}%` }}
            aria-hidden="true"
          />
        ) : null}
        {counts.neutral > 0 ? (
          <span
            className="bg-fg-subtle h-full"
            style={{ width: `${pct(counts.neutral)}%`, opacity: 0.6 }}
            aria-hidden="true"
          />
        ) : null}
        {counts.none > 0 ? (
          <span
            className="bg-bg-elev-3 h-full"
            style={{ width: `${pct(counts.none)}%` }}
            aria-hidden="true"
          />
        ) : null}
        {counts.negative > 0 ? (
          <span
            className="bg-bear h-full"
            style={{ width: `${pct(counts.negative)}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* Counts row */}
      <ul
        aria-label="Sentiment breakdown"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm tabular-nums"
      >
        <Count tone="bull" label="Bullish" count={counts.positive} pct={pct(counts.positive)} />
        <Count tone="bear" label="Bearish" count={counts.negative} pct={pct(counts.negative)} />
        <Count tone="muted" label="Neutral" count={counts.neutral} pct={pct(counts.neutral)} />
        {counts.none > 0 ? (
          <Count tone="subtle" label="Untagged" count={counts.none} pct={pct(counts.none)} />
        ) : null}
      </ul>
    </section>
  );
}

function Count({
  tone,
  label,
  count,
  pct,
}: {
  tone: 'bull' | 'bear' | 'muted' | 'subtle';
  label: string;
  count: number;
  pct: number;
}) {
  const dotClass =
    tone === 'bull'
      ? 'bg-bull'
      : tone === 'bear'
        ? 'bg-bear'
        : tone === 'muted'
          ? 'bg-fg-subtle'
          : 'bg-bg-elev-3';
  const labelClass =
    tone === 'bull'
      ? 'text-bull'
      : tone === 'bear'
        ? 'text-bear'
        : 'text-fg-muted';
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('size-2 rounded-sm', dotClass)} />
      <span className={cn('font-semibold', labelClass)}>{label}</span>
      <span className="text-fg">{count}</span>
      <span className="text-fg-subtle">({pct.toFixed(0)}%)</span>
    </li>
  );
}
