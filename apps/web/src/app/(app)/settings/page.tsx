import { Activity, Bell, ChevronRight, User } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';

import { EnableWebPushButton } from './_components/enable-web-push-button';
import { LogoutButton } from './_components/logout-button';
import { SettingsSection } from './_components/settings-section';
import { TestEmailButton } from './_components/test-email-button';
import { TestTelegramButton } from './_components/test-telegram-button';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" description="Notifications, usage, session." />

      <SettingsSection icon={<Activity className="size-4" />} title="Usage">
        <Link
          href="/settings/usage"
          className="hover:bg-bg-elev-2 -mx-1 flex items-center justify-between gap-4 rounded-lg px-3 py-2 transition-colors"
        >
          <div className="flex flex-col">
            <span className="text-fg text-sm font-medium">Usage analytics</span>
            <span className="text-fg-subtle text-xs">Token spend, last 30 days</span>
          </div>
          <ChevronRight className="text-fg-subtle size-4" />
        </Link>
      </SettingsSection>

      <SettingsSection
        icon={<Bell className="size-4" />}
        title="Notifications"
        description="Test channels and enable web push"
      >
        <div className="flex flex-col gap-2">
          <p className="text-fg-subtle text-xs">Send a one-off test email through Resend.</p>
          <TestEmailButton />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-fg-subtle text-xs">Send a one-off Telegram message.</p>
          <TestTelegramButton />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-fg-subtle text-xs">
            Web push delivers alerts to this browser even when the app is closed.
          </p>
          <EnableWebPushButton />
        </div>
      </SettingsSection>

      <SettingsSection icon={<User className="size-4" />} title="Session">
        <LogoutButton />
      </SettingsSection>
    </div>
  );
}
