// /news — server-rendered list of recent articles tagged for our scope.
// Reads via @hamafx/ai's `listRecentArticles` (Postgres-backed, populated by
// /api/cron/news) so the page is fast even on cold start.

import { listRecentArticles } from '@hamafx/ai';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { ArticleCard } from '@/components/news/article-card';
import { LiveTimestamp } from '@/components/news/live-timestamp';
import { StaggerItem } from '@/components/ui/stagger-item';

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
        <LiveTimestamp
          ms={lastUpdated}
          prefix="Latest:"
          className="text-fg-subtle text-xs"
        />
      ) : null}

      {articles.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {articles.map((a, idx) => (
            <li key={a.id}>
              <StaggerItem index={idx}>
                <ArticleCard article={a} />
              </StaggerItem>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card-premium flex flex-col items-center gap-4 p-10 text-center">
      <span
        className="text-fg-subtle inline-flex h-16 w-16 items-center justify-center rounded-3xl"
        style={{ background: 'oklch(70% 0.02 265 / 0.1)' }}
      >
        <svg
          className="size-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
          <path d="M19 8h2v9a2 2 0 0 1-2 2" />
          <path d="M8 9h7M8 13h7M8 17h4" />
        </svg>
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-fg text-base font-semibold">No news yet</p>
        <p className="text-fg-muted text-sm">
          The cron fires every 5 minutes. Tap below to trigger manually.
        </p>
      </div>
      <RefreshButton endpoint="/api/cron/news" />
    </div>
  );
}
