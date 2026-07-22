// SPDX-License-Identifier: Apache-2.0

// /news — server-rendered list of recent articles tagged for our scope.
// The page itself is a thin server wrapper: fetch + render the
// SentimentSummary above the interactive <NewsView/> client component.

import { listRecentArticles } from '@hamafx/ai';
import { IconNews } from '@tabler/icons-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';

import { RefreshButton } from './_components/refresh-button';
import { NewsView } from './_components/news-view';
import { SentimentSummary } from './_components/sentiment-summary';
import { BookmarksProvider } from '@/components/news/bookmarks-context';

export const metadata: Metadata = { title: 'News | HamaFX' };
// ISR: revalidate every 5 minutes instead of forcing dynamic on every request.
export const revalidate = 300;

export default async function NewsPage() {
  // Larger window now that the page can filter — gives the user real
  // breadth to slice through.
  const articles = await listRecentArticles(120);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="News"
        description="Headlines tagged for XAU / EUR / GBP / USD from our market data feed."
      />

      {articles.length === 0 ? (
        <EmptyState
          tone="muted"
          icon={<IconNews className="size-7" strokeWidth={1.75} />}
          title="No news yet"
          description="Headlines populate automatically every few minutes. Tap below to refresh now."
          action={<RefreshButton endpoint="/api/cron/news" />}
        />
      ) : (
        <BookmarksProvider>
          <SentimentSummary articles={articles} />
          <NewsView initialArticles={articles} />
        </BookmarksProvider>
      )}
    </div>
  );
}
