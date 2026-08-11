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
// Action row stays in normal flow at every breakpoint, so variable-length
// provider content can never be hidden underneath the controls.
//
// The card is memoized to avoid re-rendering untouched cards when bookmark updates.

import type { NewsArticle } from '@hamafx/shared';
import {IconBookmark, IconExternalLink, IconBolt} from '@tabler/icons-react';
import { m } from 'motion/react';
import { memo } from 'react';

import { cleanNewsText } from '@/lib/clean-news-text';
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
        ? 'var(--color-bull)'
        : article.sentiment === 'negative'
          ? 'var(--color-bear)'
          : null;

    const title = cleanNewsText(article.title);
    const summary = article.summary ? cleanNewsText(article.summary) : '';
    const askPrompt = encodeURIComponent(
      `What does this headline mean for my trading?\n\nTitle: ${title}\n${summary ? `Summary: ${summary}\n` : ''}${article.url}`,
    );

    const totalTags = article.symbols.length + article.topics.length;
    const showTagsInline = totalTags > 0 && totalTags <= 4;

    return (
      <article
        className={cn(
          'group relative overflow-hidden rounded-sm',
          'border border-border bg-bg-elev-1',
          'transition-colors duration-200 md:hover:bg-bg-elev-2',
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
          className="block px-4 py-4 pl-5 pb-5"
        >
          <h3 className="text-fg line-clamp-3 text-body font-semibold leading-snug">
            {title}
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

          {summary ? (
            <p className="text-fg-muted mt-2 line-clamp-2 text-body-sm leading-[1.4]">
              {summary}
            </p>
          ) : null}
        </a>

        <div
          className={cn(
            'flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2',
            'bg-bg-elev-1 transition-colors duration-150',
            'hover:bg-bg-elev-2',
          )}
        >
          <a
            href={`/chat?prompt=${askPrompt}`}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-elev-2 text-fg-muted hover:text-fg inline-flex min-h-8 items-center gap-1 rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors"
          >
            <IconBolt className="size-3.5" />
            Ask AI
          </a>
          <div className="flex items-center gap-0.5">
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
                  ? 'text-fg bg-bg-elev-2'
                  : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2',
              )}
            >
              <IconBookmark className={cn('size-4', saved && 'fill-current')} />
            </m.button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open article in new tab"
              onClick={(e) => e.stopPropagation()}
              className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex size-8 items-center justify-center rounded-sm transition-colors"
            >
              <IconExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </article>
    );
  },
  (prev, next) => {
    if (prev.saved !== next.saved) return false;
    const previous = prev.article;
    const current = next.article;
    return (
      previous.id === current.id &&
      previous.title === current.title &&
      previous.summary === current.summary &&
      previous.url === current.url &&
      previous.source === current.source &&
      previous.publisher === current.publisher &&
      previous.publishedAt === current.publishedAt &&
      previous.sentiment === current.sentiment &&
      previous.sentimentScore === current.sentimentScore &&
      previous.symbols.join('|') === current.symbols.join('|') &&
      previous.topics.join('|') === current.topics.join('|')
    );
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
