// /news — server-rendered list of recent articles tagged for our scope.
// Reads via @hamafx/ai's `listRecentArticles` (Postgres-backed, populated by
// /api/cron/news) so the page is fast even on cold start.

import type { Metadata } from 'next';

import { listRecentArticles } from '@hamafx/ai';

import { ArticleCard } from '@/components/news/article-card';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = { title: 'News' };
export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  const articles = await listRecentArticles(50);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="News"
        description="Headlines tagged for XAU / EUR / GBP / USD — Marketaux primary."
      />

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

function EmptyState() {
  return (
    <div className="text-fg-muted border-border rounded-lg border border-dashed p-6 text-center text-sm">
      <p className="mb-1 font-medium">No news articles yet.</p>
      <p className="text-fg-subtle text-xs">
        Trigger the ingestion cron once via{' '}
        <code className="bg-bg-elev-2 rounded px-1 py-0.5 text-[10px]">
          curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://hama-fx-ai.vercel.app/api/cron/news
        </code>
        , or wire a scheduler. See <code>docs/06-data-sources.md</code>.
      </p>
    </div>
  );
}
