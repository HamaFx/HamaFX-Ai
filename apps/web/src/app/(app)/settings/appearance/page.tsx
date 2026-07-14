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
import { eq } from 'drizzle-orm';
import { AppearanceCard } from '../_components/appearance-card';

export const metadata: Metadata = { title: 'Appearance | Settings | HamaFX' };
export const revalidate = 60;

export default async function AppearancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const db = getDb();

  const [settings] = await db
    .select({
      theme: schema.userSettings.theme,
      language: schema.userSettings.language,
    })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Appearance</h2>
        <p className="text-fg-subtle text-sm">Theme, locale, and display preferences.</p>
      </div>

      <AppearanceCard
        initialTheme={settings?.theme ?? null}
        initialLocale={settings?.language ?? 'en'}
      />
    </div>
  );
}
