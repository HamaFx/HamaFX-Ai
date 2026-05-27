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
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Notifications, usage, and session." />

      <SettingsSection
        icon={<Activity className="size-4" strokeWidth={2.25} />}
        iconColor="oklch(74% 0.2 152 / 0.18)"
        title="Usage"
      >
        <Link
          href="/settings/usage"
          className="hover:bg-bg-elev-2/50 -mx-2 flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors"
        >
          <div className="flex flex-col">
            <span className="text-fg text-sm font-medium">Usage analytics</span>
            <span className="text-fg-subtle text-xs">Token spend, last 30 days</span>
          </div>
          <ChevronRight className="text-fg-subtle size-4" />
        </Link>
      </SettingsSection>

      <SettingsSection
        icon={<Bell className="size-4" strokeWidth={2.25} />}
        iconColor="oklch(78% 0.16 78 / 0.18)"
        title="Notifications"
        description="Test channels and enable web push"
      >
        <SettingRow
          label="Email"
          description="One-off test through Resend"
          action={<TestEmailButton />}
        />
        <SettingRow
          label="Telegram"
          description="Send a test message to your bot"
          action={<TestTelegramButton />}
        />
        <SettingRow
          label="Web push"
          description="Browser notifications, even when closed"
          action={<EnableWebPushButton />}
        />
      </SettingsSection>

      <SettingsSection
        icon={<User className="size-4" strokeWidth={2.25} />}
        iconColor="oklch(72% 0.18 295 / 0.18)"
        title="Session"
      >
        <LogoutButton />
      </SettingsSection>
    </div>
  );
}

interface SettingRowProps {
  label: string;
  description?: string;
  action: React.ReactNode;
}

function SettingRow({ label, description, action }: SettingRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-fg text-sm font-medium">{label}</span>
        {description ? <span className="text-fg-subtle text-xs">{description}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2">{action}</div>
    </div>
  );
}
