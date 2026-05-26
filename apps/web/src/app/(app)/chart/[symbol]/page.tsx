import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isSymbol } from '@hamafx/shared';

import { PageHeader } from '@/components/layout/page-header';
import { Placeholder } from '@/components/layout/placeholder';

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: isSymbol(symbol) ? symbol : 'Chart' };
}

export default async function ChartPage({ params }: PageProps) {
  const { symbol } = await params;
  if (!isSymbol(symbol)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={symbol} description="Multi-timeframe chart with indicators." />
      <Placeholder
        phase="Phase 1a"
        title={`${symbol} chart not wired up yet`}
        description="lightweight-charts wrapper, timeframe picker, and indicator overlays land in Phase 1a — see docs/10-roadmap.md."
      />
    </div>
  );
}
