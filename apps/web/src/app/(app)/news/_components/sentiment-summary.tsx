// SPDX-License-Identifier: Apache-2.0

// Sentiment overview at the top of /news. Shows the proportional split
// of positive/negative/neutral headlines as a horizontal stacked bar.
//
// Feels like a market-pulse strip at a glance — green-heavy = market is
// reading the news bullishly, red-heavy = bearishly. Counts shown to
// the right so the bar isn't the only signal.
//
// Server component — purely derived from the article list, no state.

import type { NewsArticle } from '@kestrel/shared';

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

      {/* Gauge — a dial from bearish (left) through neutral to bullish (right).
          The needle position encodes the sentiment score in [-1, 1]; the
          colored track underneath always shows the full distribution. */}
      <SentimentGauge score={score} pct={pct} counts={counts} />

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

/**
 * Semicircular gauge rendering the sentiment score as a needle over a
 * segmented red→neutral→green track. Purely presentational — the
 * accessible summary is the score text and the counts list below.
 */
function SentimentGauge({
  score,
  pct,
  counts,
}: {
  score: number;
  pct: (n: number) => number;
  counts: { positive: number; negative: number; neutral: number; none: number };
}) {
  // Needle angle: score -1 → 180° (left), 0 → 90° (up-center), +1 → 0° (right).
  const angleDeg = 90 - score * 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cx = 120;
  const cy = 64;
  const r = 48;
  const tipX = cx + r * Math.cos(angleRad);
  const tipY = cy - r * Math.sin(angleRad);

  // Segments along the 180° arc, left (bear) → right (bull).
  const arc = (from: number, to: number, color: string, opacity = 1) => {
    const start = { x: cx + r * Math.cos(((180 - from) * Math.PI) / 180), y: cy - r * Math.sin(((180 - from) * Math.PI) / 180) };
    const end = { x: cx + r * Math.cos(((180 - to) * Math.PI) / 180), y: cy - r * Math.sin(((180 - to) * Math.PI) / 180) };
    const largeArc = to - from > 180 ? 1 : 0;
    return (
      <path
        d={`M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        opacity={opacity}
      />
    );
  };

  const bearShare = pct(counts.negative);
  const bullShare = pct(counts.positive);
  const neutralShare = pct(counts.neutral);

  // Split the 180° dial proportionally; fall back to 1/3 each when empty.
  // Segment spans are derived from the bullish/neutral shares; the
  // bearish share is the remainder (180 − bull − neutral).
  const totalShare = bearShare + neutralShare + bullShare;
  const neutralDeg = totalShare > 0 ? (neutralShare / totalShare) * 180 : 60;
  const bullDeg = totalShare > 0 ? (bullShare / totalShare) * 180 : 60;

  return (
    <div className="flex justify-center" aria-hidden="true">
      <svg
        viewBox="0 0 240 76"
        className="h-16 w-48 max-w-full"
        focusable="false"
      >
        {/* Bullish segment (right) — score +1 needle lands here. */}
        {arc(180, 180 - bullDeg, 'var(--color-bull)')}
        {/* Neutral segment (middle) */}
        {arc(180 - bullDeg, 180 - bullDeg - neutralDeg, 'var(--color-fg-subtle)', 0.6)}
        {/* Bearish segment (left) — score −1 needle lands here. */}
        {arc(180 - bullDeg - neutralDeg, 0, 'var(--color-bear)')}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-fg"
        />
        <circle cx={cx} cy={cy} r="3.5" fill="currentColor" className="text-fg" />
      </svg>
    </div>
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
