'use client';

// Premium news article card — vertical hierarchy:
//
//   ┌────────────────────────────────────────┐
//   │ [pub · time · symbols]  ▲ +0.45        │  meta strip with sentiment chip
//   │                                         │
//   │ Big headline title with strong          │  text-base/lg, leading-snug
//   │ visual weight, line-clamp 3             │
//   │                                         │
//   │ Optional summary, line-clamp 2          │  text-sm muted
//   │                                         │
//   │ #cpi  #fed  #rates                      │  topic chips
//   │ ──────────────────────────────────────  │  divider
//   │ ✦ Ask AI · 🔖 Save · ↗ Open            │  action row
//   └────────────────────────────────────────┘
//
// A 3px-wide vertical accent ribbon on the left edge encodes sentiment:
// green = bullish, red = bearish, neutral surface = neutral/none. That's
// the "scannable at a glance" signal even before the user reads the
// title.

import type { NewsArticle } from '@hamafx/shared';
import { Bookmark, ExternalLink, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';

import { useBookmarks } from './use-bookmarks';

interface ArticleCardProps {
  article: NewsArticle;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const { has, toggle } = useBookmarks();
  const saved = has(article.id);

  const sentimentColor =
    article.sentiment === 'positive'
      ? 'oklch(72% 0.18 152)'
      : article.sentiment === 'negative'
        ? 'oklch(70% 0.22 25)'
        : null;

  const askPrompt = encodeURIComponent(
    `What does this headline mean for my trading?\n\n${article.title}\n${article.url}`,
  );

  return (
    <article
      className={cn(
        'card-premium group relative overflow-hidden',
        'transition-colors duration-200 md:hover:bg-bg-elev-2/40',
      )}
    >
      {/* Sentiment accent ribbon */}
      {sentimentColor ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: sentimentColor }}
        />
      ) : null}

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-4 pb-3 pt-4 pl-5"
      >
        {/* Meta strip */}
        <div className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-fg-muted font-semibold">
            {article.publisher ?? article.source}
          </span>
          <span aria-hidden className="opacity-50">·</span>
          <time
            dateTime={new Date(article.publishedAt).toISOString()}
            className="tabular-nums"
          >
            {formatRelative(article.publishedAt)}
          </time>
          {article.sentiment ? (
            <SentimentChip
              sentiment={article.sentiment}
              score={article.sentimentScore}
            />
          ) : null}
        </div>

        {/* Headline */}
        <h3 className="text-fg mt-2.5 line-clamp-3 text-[15px] font-semibold leading-snug">
          {article.title}
        </h3>

        {/* Summary */}
        {article.summary ? (
          <p className="text-fg-muted mt-2 line-clamp-2 text-xs leading-relaxed">
            {article.summary}
          </p>
        ) : null}

        {/* Tags row — symbols + topics combined */}
        {article.symbols.length + article.topics.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
            {article.symbols.map((s) => (
              <li key={`sym-${s}`}>
                <span className="bg-brand/10 text-brand ring-brand/30 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tabular-nums ring-1">
                  {s}
                </span>
              </li>
            ))}
            {article.topics.slice(0, 4).map((t) => (
              <li key={`topic-${t}`}>
                <span className="bg-bg-elev-2 text-fg-muted ring-divider rounded-md px-1.5 py-0.5 text-[10px] lowercase ring-1">
                  #{t}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </a>

      {/* Action row */}
      <div className="border-divider/60 flex items-center justify-between gap-2 border-t px-3 py-2">
        <a
          href={`/chat?prompt=${askPrompt}`}
          className="text-fg-muted hover:text-brand inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
        >
          <Sparkles className="size-3.5" />
          Ask AI
        </a>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              toggle(article.id);
            }}
            aria-label={saved ? 'Remove bookmark' : 'Bookmark article'}
            aria-pressed={saved}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-lg transition-colors',
              saved
                ? 'text-brand bg-brand/10'
                : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
            )}
          >
            <Bookmark className={cn('size-3.5', saved && 'fill-current')} />
          </button>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open article in new tab"
            className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-8 items-center justify-center rounded-lg transition-colors"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

function SentimentChip({
  sentiment,
  score,
}: {
  sentiment: NonNullable<NewsArticle['sentiment']>;
  score: NewsArticle['sentimentScore'];
}) {
  const cls =
    sentiment === 'positive'
      ? 'bg-bull/10 text-bull ring-bull/30'
      : sentiment === 'negative'
        ? 'bg-bear/10 text-bear ring-bear/30'
        : 'bg-bg-elev-2 text-fg-muted ring-divider';
  const arrow = sentiment === 'positive' ? '▲' : sentiment === 'negative' ? '▼' : '·';
  return (
    <span
      className={cn(
        'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
        cls,
      )}
    >
      <span aria-hidden>{arrow}</span>
      {score !== null ? (
        <span className="tabular-nums">
          {score > 0 ? '+' : ''}
          {score.toFixed(2)}
        </span>
      ) : (
        sentiment
      )}
    </span>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
