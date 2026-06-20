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

// /chart/[symbol]/pro — opt-in TradingView Advanced Charting Widget view.
//
// Bypassed by `NEXT_PUBLIC_TRADINGVIEW_ENABLED='1'` — this page renders a
// tiny notice + a link back to the bundled chart when the env flag is
// off. The link from the main chart header is gated by the same env flag
// so users don't land here when it's disabled.

import { isSymbol, isTimeframe, type Timeframe } from '@hamafx/shared';
import type { Metadata } from 'next';
import { Link } from 'next-view-transitions';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';

import { TradingViewWidget } from './_components/tradingview-widget';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: isSymbol(symbol) ? `${symbol} · Pro` : 'Pro chart' };
}

export default async function ProChartPage({ params, searchParams }: PageProps) {
  const { symbol } = await params;
  if (!isSymbol(symbol)) notFound();
  const sp = await searchParams;
  const tf: Timeframe = isTimeframe(sp.tf) ? sp.tf : '1h';

  if (process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED !== '1') {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader
          title={`${symbol} · Pro`}
          description="The TradingView widget is disabled by config."
        />
        <p className="text-fg-muted text-sm">
          Set <code>NEXT_PUBLIC_TRADINGVIEW_ENABLED=1</code> on the deploy to enable this view.
        </p>
        <Link href={`/chart/${symbol}?tf=${tf}`} className="text-brand text-sm hover:underline">
          ← back to bundled chart
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title={`${symbol} · Pro`}
        description="TradingView Advanced Charting Widget"
      >
        <Link
          href={`/chart/${symbol}?tf=${tf}`}
          className="border-border bg-bg-elev-2 text-fg-muted hover:text-fg focus-visible:ring-brand inline-flex h-9 min-w-[44px] items-center justify-center rounded-md border px-2 text-body-sm font-medium focus:outline-none focus-visible:ring-2"
        >
          back to bundled
        </Link>
      </PageHeader>
      <TradingViewWidget symbol={symbol} tf={tf} />
    </div>
  );
}
