// SPDX-License-Identifier: Apache-2.0

import { BUILTIN_SYMBOLS, isKnownSymbol } from '@hamafx/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { listUserSymbols } from '@hamafx/db';
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
  const tf = sp.tf;

  if (process.env.NEXT_PUBLIC_TRADINGVIEW_ENABLED !== '1') {
    const dest = `/chart/${symbol}/structure` + (tf ? `?tf=${tf}` : '');
    redirect(dest);
  }

  const session = await auth();
  
  let userSymbolsList: string[] = [];
  if (session?.user?.id) {
    const list = await listUserSymbols(session.user.id);
    userSymbolsList = list.map((item) => item.symbol);
  }

  const watchlist = userSymbolsList.length > 0 ? userSymbolsList : ['XAUUSD', 'EURUSD', 'GBPUSD'];

  return <ProChartView symbol={symbol} watchlist={watchlist} />;
}
