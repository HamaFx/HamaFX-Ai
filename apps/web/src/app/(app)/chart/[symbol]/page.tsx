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

import { isKnownSymbol } from '@hamafx/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { listUserSymbols } from '@hamafx/db';
import { ProChartView } from './_components/pro-chart-view';

interface PageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ tf?: string }>;
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
