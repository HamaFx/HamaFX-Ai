// SPDX-License-Identifier: Apache-2.0

import { BUILTIN_SYMBOLS, DEFAULT_TIMEFRAME, isKnownSymbol } from '@hamafx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProChartView } from './_components/pro-chart-view';

interface PageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
}

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export async function generateStaticParams() {
  return BUILTIN_SYMBOLS.map((s) => ({ symbol: s.internal }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: isKnownSymbol(symbol) ? `${symbol} · Chart` : 'Chart' };
}

export default async function ChartPage({ params, searchParams }: PageProps) {
  const { symbol } = await params;
  if (!isKnownSymbol(symbol)) notFound();

  const sp = await searchParams;
  const tf = (sp.tf ?? DEFAULT_TIMEFRAME) as '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

  return <ProChartView symbol={symbol} tf={tf} />;
}
