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

import { isSymbol } from '@hamafx/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

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
