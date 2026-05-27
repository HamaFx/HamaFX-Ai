// /news — server-rendered list of recent articles tagged for our scope.
// The page itself is a thin server wrapper: fetch + render the
// SentimentSummary above the interactive <NewsView/> client component.

import { listRecentArticles } from '@hamafx/ai';
import { Newspaper } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

import { RefreshButton } from './_components/refresh-button';
import { NewsView } from './_components/news-view';
import { SentimentSummary } from './_components/sentiment-summary';

export const metadata: Metadata = { title: 'News' };
export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  // Larger window now that the page can filter — gives the user real
  // breadth to slice through.
  const articles = await listRecentArticles(120);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="News"
        description="Headlines tagged for XAU / EUR / GBP / USD — Finnhub primary, Marketaux fallback."
      />

      {articles.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<Newspaper className="size-7" strokeWidth={1.75} />}
          title="No news yet"
          description="Headlines populate automatically every few minutes. Tap below to refresh now."
          action={<RefreshButton endpoint="/api/cron/news" />}
        />
      ) : (
        <>
          <SentimentSummary articles={articles} />
          <NewsView initialArticles={articles} />
        </>
      )}
    </div>
  );
}
