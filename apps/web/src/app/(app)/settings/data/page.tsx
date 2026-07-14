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

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, asc } from 'drizzle-orm';
import { DataCard } from '../_components/data-card';
import { PreferencesCard } from '../_components/preferences-card';

export const metadata: Metadata = { title: 'Data | Settings | HamaFX' };
export const revalidate = 60;

export default async function DataPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const db = getDb();

  const [settingsRows, symbolRows] = await Promise.all([
    db.select({
      defaultSymbol: schema.userSettings.defaultSymbol,
      timeFormat: schema.userSettings.timeFormat,
      reduceMotion: schema.userSettings.reduceMotion,
    })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId)),
    db.select({ symbol: schema.userSymbols.symbol })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, userId))
      .orderBy(asc(schema.userSymbols.displayOrder)),
  ]);

  const settings = settingsRows[0] ?? null;
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
