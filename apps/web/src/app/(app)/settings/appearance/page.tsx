// SPDX-License-Identifier: Apache-2.0

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserWithSettings } from '@hamafx/db';
import { AppearanceCard } from '../_components/appearance/appearance-card';

export const metadata: Metadata = { title: 'Appearance | Settings | HamaFX' };
export const revalidate = 60;

export default async function AppearancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;

  const { settings } = await getUserWithSettings(userId);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Appearance</h2>
        <p className="text-fg-subtle text-sm">Theme, locale, and display preferences.</p>
      </div>

      <AppearanceCard
        initialLocale={settings?.language ?? 'en'}
      />
    </div>
  );
}
