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
import {IconKey, IconBell, IconRobot, IconDatabase, IconInfoCircle, IconShield} from '@tabler/icons-react';

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, asc, and } from 'drizzle-orm';
import type { NoiseConfig } from '@hamafx/shared';
import { checkIsAdmin } from '@/lib/admin-check';
import { AboutCard } from './_components/about-card';
import { OnboardingResetCard } from './_components/onboarding-reset-card';
import { AgentCard } from './_components/agent-card';
import { AIPrefsCard } from './_components/ai-prefs-card';
import { AppearanceCard } from './_components/appearance-card';
import { DataCard } from './_components/data-card';
import { NoiseControlCard } from './_components/noise-control-card';
import { NotificationPrefsCard } from './_components/notification-prefs-card';
import { NotificationsCard } from './_components/notifications-card';
import { PreferencesCard } from './_components/preferences-card';
import { ChangePasswordCard } from './_components/change-password-card';
import { SessionsCard } from './_components/sessions-card';
import { SettingsSection } from './_components/settings-section';
import { SystemStatusCard } from './_components/system-status-card';
import { UsageGlance } from './_components/usage-glance';
import { TwoFactorSetup } from './_components/two-factor-setup';
import { LinkedAccountsCard } from './_components/linked-accounts-card';

export const metadata: Metadata = { title: 'Settings | HamaFX' };
// We render server components that hit the DB (push subscription count,
// usage stats), so we need a fresh render on every visit.
export const revalidate = 60;

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const db = getDb();
  let watchlist: string[] = ['XAUUSD', 'EURUSD', 'GBPUSD'];
  let aiPrefs: { customInstructions: string | null } = { customInstructions: null };
  let uiPrefs: { defaultSymbol: string | null; timeFormat: string | null; reduceMotion: boolean | null; theme: string | null } = {
    defaultSymbol: null,
    timeFormat: null,
    reduceMotion: null,
    theme: null,
  };
  let notificationPrefs: Record<string, Record<string, boolean>> | null = null;
  let locale = 'en';
  let twoFactorEnabled = false;

  // Check if user has linked Google account
  const [googleAccount] = await db
    .select({ id: schema.accounts.providerAccountId })
    .from(schema.accounts)
    .where(and(
      eq(schema.accounts.userId, userId),
      eq(schema.accounts.provider, 'google'),
    ))
    .limit(1);
  const googleLinked = !!googleAccount;

      const [[userRow], [settings], list] = await Promise.all([
    db.select({
      twoFactorEnabled: schema.users.twoFactorEnabled,
    }).from(schema.users).where(eq(schema.users.id, userId)),
    db.select({
      customInstructions: schema.userSettings.customInstructions,
      defaultSymbol: schema.userSettings.defaultSymbol,
      timeFormat: schema.userSettings.timeFormat,
      reduceMotion: schema.userSettings.reduceMotion,
      theme: schema.userSettings.theme,
      language: schema.userSettings.language,
      notificationPrefs: schema.userSettings.notificationPreferences,
    })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId)),
    db.select({ symbol: schema.userSymbols.symbol })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, userId))
      .orderBy(asc(schema.userSymbols.displayOrder)),
  ]);

  const noiseConfig = settings?.notificationPrefs && typeof settings.notificationPrefs === 'object'
    ? (settings.notificationPrefs as Record<string, unknown>).noiseConfig as NoiseConfig | undefined
    : undefined;

  const isAdmin = await checkIsAdmin();
  twoFactorEnabled = userRow?.twoFactorEnabled ?? false;
  if (settings) {
    aiPrefs = { customInstructions: settings.customInstructions ?? null };
    uiPrefs = {
      defaultSymbol: settings.defaultSymbol,
      timeFormat: settings.timeFormat ?? null,
      reduceMotion: settings.reduceMotion,
      theme: settings.theme ?? null,
    };
    locale = settings.language ?? 'en';
    notificationPrefs = settings.notificationPrefs as Record<string, Record<string, boolean>> | null;
  }
  if (list.length > 0) {
    watchlist = list.map((item) => item.symbol);
  }

  return (
    <div className="flex flex-col gap-8">
      <SystemStatusCard userId={userId} />
      <UsageGlance userId={userId} />

      <SettingsSection icon={<IconKey className="size-4" />} title="Security" description="Password, two-factor, and active sessions">
        <ChangePasswordCard />
        <TwoFactorSetup enabled={twoFactorEnabled} />
        <LinkedAccountsCard googleLinked={googleLinked} />
        <SessionsCard />
      </SettingsSection>

      <SettingsSection icon={<IconBell className="size-4" />} title="Notifications" description="Alert channels, noise control, and test buttons">
        <NotificationsCard userId={userId} />
        <NoiseControlCard initialConfig={noiseConfig ?? null} />
        <NotificationPrefsCard initialPrefs={notificationPrefs} />
      </SettingsSection>

      <SettingsSection icon={<IconRobot className="size-4" />} title="AI & Agent" description="Analysis mode, disabled tools, and model configuration">
        <AgentCard />
        <AIPrefsCard initialCustomInstructions={aiPrefs.customInstructions} />
      </SettingsSection>

      <SettingsSection icon={<IconDatabase className="size-4" />} title="Data" description="Portfolio, track record, and symbol preferences">
        <DataCard />
        <PreferencesCard watchlist={watchlist} initialPrefs={uiPrefs} />
      </SettingsSection>

      <SettingsSection icon={<IconInfoCircle className="size-4" />} title="About" description="App info and system status">
        <AboutCard />
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection icon={<IconShield className="size-4" />} title="Admin" description="Debug and testing tools">
          <OnboardingResetCard />
        </SettingsSection>
      ) : null}

      <AppearanceCard initialTheme={uiPrefs.theme} initialLocale={locale} />
    </div>
  );
}
