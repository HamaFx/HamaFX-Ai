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

'use client';

// Phase 1.6 — News pulse widget.
//
// Slim summary of the recent news flow: a stacked sentiment bar + the
// headline at each extreme (most positive, most negative). Reuses the
// `SentimentSummary` body semantics but compresses them into a card
// suitable for the dashboard grid.

import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import type { NewsArticle } from '@hamafx/shared';

import { cn } from '@/lib/cn';

interface NewsPulseWidgetProps {
  articles: readonly NewsArticle[];
}

export function NewsPulseWidget({ articles }: NewsPulseWidgetProps) {
  const counts = { positive: 0, negative: 0, neutral: 0, none: 0 };
  for (const a of articles) {
    if (a.sentiment === 'positive') counts.positive += 1;
    else if (a.sentiment === 'negative') counts.negative += 1;
    else if (a.sentiment === 'neutral') counts.neutral += 1;
    else counts.none += 1;
  }
  const total = articles.length;
  const pct = (n: number) => (total > 0 ? Math.max(0, (n / total) * 100) : 0);
  const rawScore = total > 0 ? (counts.positive - counts.negative) / total : 0;
  const score = Math.max(-1, Math.min(1, rawScore));
  const leanLabel =
    score > 0.15 ? 'Bullish' : score < -0.15 ? 'Bearish' : 'Neutral';
  const leanTone =
    score > 0.15 ? 'text-bull' : score < -0.15 ? 'text-bear' : 'text-fg-muted';

  // Headlines at the extremes.
  const ranked = [...articles]
    .filter((a) => a.sentimentScore !== null)
    .sort((a, b) => (b.sentimentScore ?? 0) - (a.sentimentScore ?? 0));
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];

  return (
    <section
      aria-labelledby="news-pulse-heading"
      className="border-divider bg-bg-elev-1 flex flex-col gap-3 rounded-lg border p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Newspaper className="text-fg-subtle size-4" />
          <span
            id="news-pulse-heading"
            className="text-fg text-body-sm font-semibold"
          >
            News pulse
          </span>
          <span className={cn('text-caption font-semibold tabular-nums', leanTone)}>
            {leanLabel}
          </span>
        </div>
        <Link href="/news" className="text-fg-subtle hover:text-fg text-caption">
          Open news
        </Link>
      </header>

      {/* Sentiment bar */}
      <div
        role="img"
        aria-label={`${total} articles: ${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral`}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg-elev-2"
      >
        <div
          className="h-full bg-bull"
          style={{ width: `${pct(counts.positive)}%` }}
        />
        <div
          className="h-full bg-fg-muted"
          style={{ width: `${pct(counts.neutral)}%` }}
        />
        <div
          className="h-full bg-bear"
          style={{ width: `${pct(counts.negative)}%` }}
        />
      </div>

      <div className="text-fg-subtle flex items-center justify-between text-caption tabular-nums">
        <span>{counts.positive} bull</span>
        <span>{counts.neutral} neut</span>
        <span>{counts.negative} bear</span>
      </div>

      {top || bottom ? (
        <ul className="flex flex-col gap-2">
          {top ? (
            <li className="border-divider/40 border-l-2 border-l-bull/50 pl-2">
              <span className="text-fg-subtle text-caption uppercase tracking-wider">
                Most positive
              </span>
              <a
                href={top.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg hover:text-brand line-clamp-2 text-body-sm"
              >
                {top.title}
              </a>
            </li>
          ) : null}
          {bottom && bottom.id !== top?.id ? (
            <li className="border-divider/40 border-l-2 border-l-bear/50 pl-2">
              <span className="text-fg-subtle text-caption uppercase tracking-wider">
                Most negative
              </span>
              <a
                href={bottom.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg hover:text-brand line-clamp-2 text-body-sm"
              >
                {bottom.title}
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
