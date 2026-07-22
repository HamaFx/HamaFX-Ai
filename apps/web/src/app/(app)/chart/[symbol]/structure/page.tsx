// SPDX-License-Identifier: Apache-2.0

import { BUILTIN_SYMBOLS, isKnownSymbol } from '@hamafx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { auth } from '@/auth';
import { listUserSymbols } from '@hamafx/db';
import { ChartView } from '../_components/chart-view';

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export async function generateStaticParams() {
  return BUILTIN_SYMBOLS.map((s) => ({ symbol: s.internal }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  return { title: isKnownSymbol(symbol) ? `${symbol} · Structure` : 'Structure' };
}

export default async function StructureChartPage({ params }: PageProps) {
  const { symbol } = await params;
  if (!isKnownSymbol(symbol)) notFound();

  const session = await auth();
  
  let userSymbolsList: string[] = [];
  if (session?.user?.id) {
    const list = await listUserSymbols(session.user.id);
    userSymbolsList = list.map((item) => item.symbol);
  }

  const watchlist = userSymbolsList.length > 0 ? userSymbolsList : ['XAUUSD', 'EURUSD', 'GBPUSD'];

  return <ChartView symbol={symbol} watchlist={watchlist} />;
}
