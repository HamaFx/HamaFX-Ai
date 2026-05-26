import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isSymbol } from '@hamafx/shared';

import { ChartView } from './_components/chart-view';

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

  return <ChartView symbol={symbol} />;
}
