'use client';

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
import { Bookmark, BookmarkCheck, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ArticleCard } from '@/components/news/article-card';
import { useBookmarks } from '@/components/news/use-bookmarks';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

import { NewsToolbar, type SentimentFilter, type SymbolFilter } from './news-toolbar';

interface NewsViewProps {
  initialArticles: NewsArticle[];
}

const AUTO_REFRESH_MS = 5 * 60_000;

export function NewsView({ initialArticles }: NewsViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');
  const [symbol, setSymbol] = useState<SymbolFilter>('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(Date.now());
  const { count: savedCount, list: savedIds } = useBookmarks();

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
    for (const a of initialArticles) {
      for (const s of a.symbols) {
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [initialArticles]);

  // Apply filters in priority order: savedOnly → search → sentiment → symbol.
  const filtered = useMemo(() => {
    const savedSet = new Set(savedIds);
    const q = query.trim().toLowerCase();
    return initialArticles.filter((a) => {
      if (savedOnly && !savedSet.has(a.id)) return false;
      if (sentiment !== 'all') {
        if (sentiment === 'neutral') {
          if (a.sentiment !== 'neutral' && a.sentiment !== null) return false;
        } else if (a.sentiment !== sentiment) return false;
      }
      if (symbol !== 'all') {
        if (!a.symbols.includes(symbol)) return false;
      }
      if (q) {
        const haystack = `${a.title} ${a.summary ?? ''} ${a.publisher ?? a.source}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [initialArticles, sentiment, symbol, query, savedOnly, savedIds]);

  const buckets = useMemo(() => bucketByTime(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <NewsToolbar
        query={query}
        onQuery={setQuery}
        sentiment={sentiment}
        onSentiment={setSentiment}
        symbol={symbol}
        onSymbol={setSymbol}
        symbolOptions={symbolOptions}
        visibleCount={filtered.length}
        totalCount={initialArticles.length}
      />

      {/* Saved-only toggle + manual refresh row */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSavedOnly((v) => !v)}
          aria-pressed={savedOnly}
          disabled={savedCount === 0}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            savedOnly
              ? 'bg-brand text-brand-fg border-brand'
              : 'border-divider bg-bg-elev-1/60 text-fg-muted hover:text-fg',
          )}
        >
          {savedOnly ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
          Saved {savedCount > 0 ? `· ${savedCount}` : ''}
        </button>

        <button
          type="button"
          onClick={manualRefresh}
          disabled={pending}
          aria-label="Refresh now"
          className="text-fg-muted hover:text-fg hover:bg-bg-elev-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RotateCw className={cn('size-3.5', pending && 'animate-spin')} />
          {pending ? 'Refreshing…' : `Updated ${formatRelative(lastRefreshed)}`}
        </button>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<Bookmark className="size-7" strokeWidth={1.75} />}
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
                className="bg-bg/95 supports-[backdrop-filter]:bg-bg/70 text-fg-subtle sticky z-10 -mx-4 flex items-baseline gap-2 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md"
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

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
