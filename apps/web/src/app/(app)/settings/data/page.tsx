// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserWithSettings, listUserSymbols } from '@hamafx/db';
import { DataCard } from '../_components/data/data-card';
import { PreferencesCard } from '../_components/data/preferences-card';

export const metadata: Metadata = { title: 'Data | Settings | HamaFX' };
export const revalidate = 60;

export default async function DataPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const [{ settings }, symbolRows] = await Promise.all([
    getUserWithSettings(userId),
    listUserSymbols(userId),
  ]);

  const list = symbolRows;

  let watchlist: string[] = ['XAUUSD', 'EURUSD', 'GBPUSD'];
  if (list.length > 0) {
    watchlist = list.map((item) => item.symbol);
  }

  const uiPrefs = {
    defaultSymbol: settings?.defaultSymbol ?? null,
    timeFormat: settings?.timeFormat ?? null,
    reduceMotion: settings?.reduceMotion ?? null,
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Data & Preferences</h2>
        <p className="text-fg-subtle text-sm">Local data management, cache controls, and display preferences.</p>
      </div>

      <DataCard />
      <PreferencesCard watchlist={watchlist} initialPrefs={uiPrefs} />
    </div>
  );
}
