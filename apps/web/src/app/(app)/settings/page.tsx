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
import {IconKey, IconBell, IconRobot, IconDatabase, IconInfoCircle, IconShield, IconChevronRight, IconPalette} from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import { auth } from '@/auth';
import { checkIsAdmin } from '@/lib/admin-check';
import { AboutCard } from './_components/about-card';
import { OnboardingResetCard } from './_components/onboarding-reset-card';
import { SettingsSection } from './_components/settings-section';
import { SystemStatusCard } from './_components/system-status-card';
import { UsageGlance } from './_components/usage-glance';

export const metadata: Metadata = { title: 'Settings | HamaFX' };
export const revalidate = 60;

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const userId = session.user.id;
  const isAdmin = await checkIsAdmin();

  return (
    <div className="flex flex-col gap-8">
      <SystemStatusCard userId={userId} />
      <UsageGlance userId={userId} />

      {/* Quick-link cards to the new subpages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickLink
          href="/settings/security"
          icon={<IconShield className="size-4" />}
          title="Security"
          description="Password, 2FA, linked accounts, sessions"
        />
        <QuickLink
          href="/settings/notifications"
          icon={<IconBell className="size-4" />}
          title="Notifications"
          description="Test channels, noise control, preferences"
        />
        <QuickLink
          href="/settings/appearance"
          icon={<IconPalette className="size-4" />}
          title="Appearance"
          description="Theme, locale, display settings"
        />
        <QuickLink
          href="/settings/data"
          icon={<IconDatabase className="size-4" />}
          title="Data & Preferences"
          description="Cache, exports, watchlist defaults"
        />
        <QuickLink
          href="/settings/agent"
          icon={<IconRobot className="size-4" />}
          title="AI & Agent"
          description="Tools catalogue, analysis mode, model overrides"
        />
        <QuickLink
          href="/settings/api-keys"
          icon={<IconKey className="size-4" />}
          title="API Keys"
          description="BYOK provider keys, market data config"
        />
      </div>

      <SettingsSection icon={<IconInfoCircle className="size-4" />} title="About" description="App info and system status">
        <AboutCard />
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection icon={<IconShield className="size-4" />} title="Admin" description="Debug and testing tools">
          <OnboardingResetCard />
        </SettingsSection>
      ) : null}
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="border border-border bg-bg-elev-1 rounded-sm group flex items-center gap-3 p-4 transition-colors md:hover:bg-bg-elev-2/40"
    >
      <span className="text-fg-muted inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-bg-elev-2">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg text-sm font-semibold leading-tight">{title}</span>
        <span className="text-fg-subtle text-xs leading-snug">{description}</span>
      </div>
      <IconChevronRight className="text-fg-subtle size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
