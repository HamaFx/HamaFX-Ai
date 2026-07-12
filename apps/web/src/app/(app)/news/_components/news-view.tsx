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

// /news interactive view. Server component fetches the articles, this
// client component owns the filter state, search, time bucketing, and
// the auto-refresh affordance.
//
// Time buckets:
//   - "Last hour"    < 60 min
//   - "Today"        same calendar day in user's tz
//   - "Yesterday"    previous calendar day
//   - "This week"    rest of current ISO week
//   - "Older"        everything else
//
// Each bucket renders as a sticky-headed section so scrolling preserves
// the "where am I in the timeline" cue.

import type { NewsArticle, SymbolOrCurrencyTag } from '@hamafx/shared';
import {IconBookmark, IconRefresh} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useQueryState } from 'nuqs';

import { ArticleCard } from '@/components/news/article-card';
import { useBookmarks } from '@/components/news/use-bookmarks';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { startOfDay } from '@/lib/datetime';

import { NewsToolbar, type SentimentFilter, type SymbolFilter } from './news-toolbar';

interface NewsViewProps {
  initialArticles: NewsArticle[];
}

const AUTO_REFRESH_MS = 5 * 60_000;
const SEARCH_DEBOUNCE_MS = 300;

export function NewsView({ initialArticles }: NewsViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useQueryState('q', { defaultValue: '' });
  const [queryInput, setQueryInput] = useState(query);
  const [sentiment, setSentiment] = useQueryState('sentiment', { defaultValue: 'all' }) as [SentimentFilter, (val: SentimentFilter) => void];
  const [symbol, setSymbol] = useQueryState('symbol', { defaultValue: 'all' }) as [SymbolFilter, (val: SymbolFilter) => void];
  const [savedOnly, setSavedOnly] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const { count: savedCount, list: savedIds } = useBookmarks();

  // Debounce search input before updating query param (avoids refetch on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryInput !== query) {
        setQuery(queryInput || null);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput, query, setQuery]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['news', { sentiment, symbol, query }] as const,
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('offset', String(pageParam));
      params.set('limit', '20');
      if (sentiment && sentiment !== 'all') params.set('sentiment', sentiment);
      if (symbol && symbol !== 'all') params.set('symbol', symbol);
      if (query) params.set('q', query);

      const r = await fetch(`/api/news?${params.toString()}`);
      if (!r.ok) throw new Error('Failed to fetch news');
      return r.json() as Promise<{ items: NewsArticle[]; hasMore: boolean; nextOffset: number }>;
    },
    getNextPageParam: (last: { hasMore: boolean; nextOffset: number }) => last.hasMore ? last.nextOffset : undefined,
    initialPageParam: 0,
    ...((sentiment === 'all' && symbol === 'all' && !query) ? {
      initialData: {
        pages: [{ items: initialArticles, hasMore: initialArticles.length >= 120, nextOffset: initialArticles.length }],
        pageParams: [0]
      }
    } : {}),
  });

  const allArticles = useMemo(() => {
    if (!data) return initialArticles;
    return data.pages.flatMap((page) => page.items);
  }, [data, initialArticles]);

  // Auto-refresh every 5 minutes (the cron usually runs faster than this
  // upstream, but a soft visual heartbeat keeps the page feeling alive).
  useEffect(() => {
    const id = setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLastRefreshed(Date.now());
      });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  function manualRefresh() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/cron/news');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success('News refreshed');
        router.refresh();
        setLastRefreshed(Date.now());
      } catch (err) {
        toast.error('Refresh failed', {
          description: err instanceof Error ? err.message : 'Network error',
        });
      }
    });
  }

  // Distinct tags actually present in the loaded set, sorted by frequency.
  const symbolOptions = useMemo(() => {
    const counts = new Map<SymbolOrCurrencyTag, number>();
    for (const a of allArticles) {
      for (const s of a.symbols) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [allArticles]);

  const filtered = useMemo(() => {
    const savedSet = new Set(savedIds);
    return allArticles.filter((a) => {
      if (savedOnly && !savedSet.has(a.id)) return false;
      return true;
    });
  }, [allArticles, savedOnly, savedIds]);

  const buckets = useMemo(() => bucketByTime(filtered), [filtered]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="flex flex-col gap-4">
      <NewsToolbar
        query={queryInput}
        onQuery={setQueryInput}
        sentiment={sentiment}
        onSentiment={setSentiment}
        symbol={symbol}
        onSymbol={setSymbol}
        symbolOptions={symbolOptions}
        visibleCount={filtered.length}
        totalCount={allArticles.length}
      />

      {/* Saved-only toggle + manual refresh row */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSavedOnly((v) => !v)}
          aria-pressed={savedOnly}
          disabled={savedCount === 0}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-sm border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            savedOnly
              ? 'bg-fg text-black border-border'
              : 'border-border bg-bg-elev-1/60 text-fg-muted hover:text-fg',
          )}
        >
          {savedOnly ? <IconBookmark className="size-3.5" /> : <IconBookmark className="size-3.5" />}
          Saved {savedCount > 0 ? `· ${savedCount}` : ''}
        </button>

        <button
          type="button"
          onClick={manualRefresh}
          disabled={pending}
          aria-label="Refresh now"
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <IconRefresh className={cn('size-3.5', pending && 'animate-spin')} />
          {pending ? 'Refreshing…' : `Updated ${formatRelative(lastRefreshed)}`}
        </button>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<IconBookmark className="size-7" strokeWidth={1.75} />}
          title={savedOnly ? 'No saved articles' : 'Nothing matches'}
          description={
            savedOnly
              ? 'Save articles by tapping the bookmark icon on any card.'
              : 'Try clearing the search or pick a different sentiment / symbol filter.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {buckets.map(([label, items]) => (
            <section key={label} className="flex flex-col gap-3">
              <h2
                className="bg-bg-elev-1/95 text-fg-subtle sticky z-10 -mx-4 flex items-baseline gap-2 px-5 py-2 text-caption font-semibold uppercase tracking-wider"
                style={{ top: 'calc(var(--topbar-h) + env(safe-area-inset-top))' }}
              >
                {label}
                <span className="text-fg-subtle/60 tabular-nums">{items.length}</span>
              </h2>
              <ul className="flex flex-col gap-3">
                {items.map((a) => (
                  <li key={a.id}>
                    <ArticleCard article={a} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="flex flex-col gap-3">
            {isFetchingNextPage ? (
              <>
                <SkeletonCard className="h-24" lines={3} />
                <SkeletonCard className="h-24" lines={3} />
                <SkeletonCard className="h-24" lines={3} />
              </>
            ) : allArticles.length > 0 && !hasNextPage ? (
              <span className="text-xs text-fg-muted text-center py-2">{allArticles.length} articles loaded</span>
            ) : allArticles.length > 0 ? (
              <span className="text-xs text-fg-muted text-center py-2">{allArticles.length} articles loaded · scroll for more</span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Bucket = readonly [label: string, items: NewsArticle[]];

function bucketByTime(articles: readonly NewsArticle[]): Bucket[] {
  if (articles.length === 0) return [];
  const now = Date.now();
  const HOUR = 60 * 60_000;
  const DAY = 24 * HOUR;

  const today0 = startOfDay(now);
  const yesterday0 = today0 - DAY;
  const weekAgo = today0 - 6 * DAY;

  const hour: NewsArticle[] = [];
  const today: NewsArticle[] = [];
  const yesterday: NewsArticle[] = [];
  const week: NewsArticle[] = [];
  const older: NewsArticle[] = [];

  for (const a of articles) {
    if (now - a.publishedAt < HOUR) hour.push(a);
    else if (a.publishedAt >= today0) today.push(a);
    else if (a.publishedAt >= yesterday0) yesterday.push(a);
    else if (a.publishedAt >= weekAgo) week.push(a);
    else older.push(a);
  }

  const buckets: Bucket[] = [];
  if (hour.length) buckets.push(['Last hour', hour]);
  if (today.length) buckets.push(['Today', today]);
  if (yesterday.length) buckets.push(['Yesterday', yesterday]);
  if (week.length) buckets.push(['This week', week]);
  if (older.length) buckets.push(['Older', older]);
  return buckets;
}

