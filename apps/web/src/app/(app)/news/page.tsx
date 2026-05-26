import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

export const metadata: Metadata = { title: 'News' };

export default function NewsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="News"
        description="Curated headlines tagged for XAU / EUR / GBP / USD."
      />
      <Placeholder
        phase="Phase 1c"
        title="News feed not wired up yet"
        description="Marketaux + Finnhub adapters, Vercel-Cron ingestion every 5 min, and sentiment chips land in Phase 1c."
      />
    </div>
  );
}
