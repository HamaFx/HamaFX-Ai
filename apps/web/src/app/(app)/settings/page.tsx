import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/page-header';

import { AboutCard } from './_components/about-card';
import { DataCard } from './_components/data-card';
import { NotificationsCard } from './_components/notifications-card';
import { PreferencesCard } from './_components/preferences-card';
import { SystemStatusCard } from './_components/system-status-card';
import { UsageGlance } from './_components/usage-glance';

export const metadata: Metadata = { title: 'Settings' };
// We render server components that hit the DB (push subscription count,
// usage stats), so we need a fresh render on every visit.
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Settings"
        description="System health, notifications, preferences, and local data."
      />

      <SystemStatusCard />
      <UsageGlance />
      <NotificationsCard />
      <PreferencesCard />
      <DataCard />
      <AboutCard />
    </div>
  );
}
