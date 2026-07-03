'use client';

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

// Premium news article card — three-zone hierarchy:
//
//   ┌────────────────────────────────────────┐
//   │ [Headline — line-clamp 3, weight 600]  │  zone 1
//   │ [Meta inline — pub · time · ▲ score]  │  zone 2
//   │ [Summary — line-clamp 2, muted]        │  zone 3
//   └────────────────────────────────────────┘
//
// Tags (symbols + topics) fold INTO the meta inline when their total
// count is small (≤4). Otherwise they're suppressed — the agent can
// surface them in chat if the user asks.
//
// A 1px-wide vertical accent ribbon on the left edge encodes sentiment:
// green = bullish, red = bearish, no ribbon = neutral. Kept as the
// "scannable at a glance" signal even before the user reads the title.
//
// Action row (Ask AI, Bookmark, Open) lives in a hover overlay on desktop
// (revealed on card hover or keyboard focus). On touch devices, the row
// is permanently visible — touch affordances don't have hover. This keeps
// the resting card body to three clean zones without losing the three
// primary actions.
//
// Action overlay is memoized to avoid re-rendering untouched cards when bookmark updates.

import type { NewsArticle } from '@hamafx/shared';
import { Bookmark, ExternalLink, Sparkles } from 'lucide-react';
import { m } from 'motion/react';
import { memo } from 'react';

import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

import { useBookmarks } from './use-bookmarks';

interface ArticleCardProps {
  article: NewsArticle;
}

const SENTIMENT_GLYPH = {
  positive: '▲',
  negative: '▼',
  neutral: '·',
} as const;

const ArticleCardInner = memo(
  function ArticleCardInner({
    article,
    saved,
    onToggle,
  }: {
    article: NewsArticle;
    saved: boolean;
    onToggle: (id: string) => void;
  }) {
    const sentimentColor =
      article.sentiment === 'positive'
        ? '#10B981'
        : article.sentiment === 'negative'
          ? '#EF4444'
          : null;

    const askPrompt = encodeURIComponent(
      `What does this headline mean for my trading?\n\nTitle: ${article.title}\n${article.summary ? `Summary: ${article.summary}\n` : ''}${article.url}`,
    );

    const totalTags = article.symbols.length + article.topics.length;
    const showTagsInline = totalTags > 0 && totalTags <= 4;

    const overlayVisibility =
      'opacity-0 transition-opacity duration-150 ' +
      'group-hover:pointer-events-auto group-hover:opacity-100 ' +
      'group-focus-within:pointer-events-auto group-focus-within:opacity-100 ' +
      '[@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto';

    return (
      <article
        className={cn(
          'group relative overflow-hidden rounded-sm',
          'border border-zinc-800 bg-bg-elev-1',
          'transition-colors duration-200 md:hover:bg-zinc-900',
        )}
      >
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
          className="block px-4 py-4 pl-5"
        >
          <h3 className="text-fg line-clamp-3 text-body font-semibold leading-snug">
            {article.title}
          </h3>

          <div className="text-fg-subtle mt-2 flex flex-wrap items-center gap-x-2 text-body-sm tabular-nums">
            <span className="text-fg-muted font-medium">
              {article.publisher ?? article.source}
            </span>
            <span aria-hidden className="opacity-50">·</span>
            <time dateTime={new Date(article.publishedAt).toISOString()}>
              {formatRelative(article.publishedAt)}
            </time>
            {article.sentiment && article.sentimentScore !== null ? (
              <>
                <span aria-hidden className="opacity-50">·</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-semibold',
                    article.sentiment === 'positive' ? 'text-bull' : 'text-bear',
                  )}
                >
                  <span aria-hidden>
                    {SENTIMENT_GLYPH[article.sentiment as keyof typeof SENTIMENT_GLYPH]}
                  </span>
                  {article.sentimentScore > 0 ? '+' : ''}
                  {article.sentimentScore.toFixed(2)}
                </span>
              </>
            ) : null}
            {showTagsInline
              ? renderInlineTags(article.symbols, article.topics)
              : null}
          </div>

          {article.summary ? (
            <p className="text-fg-muted mt-2 line-clamp-2 text-body-sm leading-[1.4]">
              {article.summary}
            </p>
          ) : null}
        </a>

        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0',
            'flex items-center justify-between gap-1 px-3 pb-2',
            overlayVisibility,
          )}
        >
          <a
            href={`/chat?prompt=${askPrompt}`}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 text-fg-muted hover:text-fg pointer-events-auto inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-body-sm font-medium transition-colors"
          >
            <Sparkles className="size-3.5" />
            Ask AI
          </a>
          <div className="pointer-events-auto flex items-center gap-0.5">
            <m.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={(e) => {
                e.preventDefault();
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
                onToggle(article.id);
              }}
              aria-label={saved ? 'Remove bookmark' : 'Bookmark article'}
              aria-pressed={saved}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-sm transition-colors',
                saved
                  ? 'text-fg bg-zinc-900'
                  : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
              )}
            >
              <Bookmark className={cn('size-4', saved && 'fill-current')} />
            </m.button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open article in new tab"
              onClick={(e) => e.stopPropagation()}
              className="text-fg-muted hover:text-fg hover:bg-zinc-900 inline-flex size-8 items-center justify-center rounded-sm transition-colors"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </article>
    );
  },
  (prev, next) => {
    if (prev.article.id !== next.article.id) return false;
    if (prev.article.title !== next.article.title) return false;
    if (prev.saved !== next.saved) return false;
    return true;
  },
);

export function ArticleCard({ article }: ArticleCardProps) {
  const { has, toggle } = useBookmarks();
  const saved = has(article.id);

  return <ArticleCardInner article={article} saved={saved} onToggle={toggle} />;
}

// ---------------------------------------------------------------------------

function renderInlineTags(
  symbols: readonly string[],
  topics: readonly string[],
) {
  const items: Array<{ key: string; kind: 'symbol' | 'topic'; value: string }> = [
    ...symbols.slice(0, 2).map((s) => ({ key: `sym-${s}`, kind: 'symbol' as const, value: s })),
    ...topics.slice(0, 2).map((t) => ({ key: `topic-${t}`, kind: 'topic' as const, value: t })),
  ];
  return (
    <>
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-x-2">
          <span aria-hidden className="opacity-50">·</span>
          <span
            className={cn(
              'font-medium',
              item.kind === 'symbol' ? 'uppercase' : 'opacity-75',
            )}
          >
            {item.kind === 'topic' ? `#${item.value}` : item.value}
          </span>
        </span>
      ))}
    </>
  );
}
