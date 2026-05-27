// /news — server-rendered list of recent articles tagged for our scope.
// Reads via @hamafx/ai's `listRecentArticles` (Postgres-backed, populated by
// /api/cron/news) so the page is fast even on cold start.

import { listRecentArticles } from '@hamafx/ai';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { ArticleCard } from '@/components/news/article-card';

import { RefreshButton } from './_components/refresh-button';

export const metadata: Metadata = { title: 'News' };
export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  const articles = await listRecentArticles(50);

  const lastUpdated = articles.length > 0 ? articles[0]!.publishedAt : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="News"
        description="Headlines tagged for XAU / EUR / GBP / USD — Finnhub primary, Marketaux fallback."
      />

      {lastUpdated ? (
        <p className="text-fg-subtle text-xs">
          Latest: {formatRelative(lastUpdated)}
        </p>
      ) : null}

      {articles.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {articles.map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      )}
    </div>
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

function EmptyState() {
  return (
    <div className="text-fg-muted border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center text-sm">
      <p className="font-medium">No news articles yet.</p>
      <p className="text-fg-subtle text-xs">
        The cron fires every 5 minutes. Tap below to trigger manually.
      </p>
      <RefreshButton endpoint="/api/cron/news" />
    </div>
  );
}
