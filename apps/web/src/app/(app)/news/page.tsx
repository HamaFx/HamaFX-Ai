// /news — server-rendered list of recent articles tagged for our scope.
// Reads via @hamafx/ai's `listRecentArticles` (Postgres-backed, populated by
// /api/cron/news) so the page is fast even on cold start.

import { listRecentArticles } from '@hamafx/ai';
import { Newspaper } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { ArticleCard } from '@/components/news/article-card';
import { LiveTimestamp } from '@/components/news/live-timestamp';
import { EmptyState } from '@/components/ui/empty-state';

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
        <LiveTimestamp ms={lastUpdated} prefix="Latest:" className="text-fg-subtle text-xs" />
      ) : null}

      {articles.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<Newspaper className="size-7" strokeWidth={1.75} />}
          title="No news yet"
          description="Headlines populate automatically every few minutes. Tap below to refresh now."
          action={<RefreshButton endpoint="/api/cron/news" />}
        />
      ) : (
        <ul className="flex flex-col gap-3">
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
