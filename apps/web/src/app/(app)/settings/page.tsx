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

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, asc } from 'drizzle-orm';
import { AboutCard } from './_components/about-card';
import { AgentCard } from './_components/agent-card';
import { AIPrefsCard } from './_components/ai-prefs-card';
import { DataCard } from './_components/data-card';
import { NotificationsCard } from './_components/notifications-card';
import { PreferencesCard } from './_components/preferences-card';
import { SystemStatusCard } from './_components/system-status-card';
import { UsageGlance } from './_components/usage-glance';

export const metadata: Metadata = { title: 'Settings' };
// We render server components that hit the DB (push subscription count,
// usage stats), so we need a fresh render on every visit.
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  const db = getDb();
  let watchlist: string[] = ['XAUUSD', 'EURUSD', 'GBPUSD'];
  if (session?.user?.id) {
    const list = await db.select({ symbol: schema.userSymbols.symbol })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, session.user.id))
      .orderBy(asc(schema.userSymbols.displayOrder));
    if (list.length > 0) {
      watchlist = list.map((item) => item.symbol);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SystemStatusCard />
      <UsageGlance />
      <AgentCard />
      <AIPrefsCard />
      <NotificationsCard />
      <PreferencesCard watchlist={watchlist} />
      <DataCard />
      <AboutCard />
    </div>
  );
}
