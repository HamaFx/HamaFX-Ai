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
import type { NoiseConfig } from '@hamafx/shared';
import { NoiseControlCard } from '../_components/noise-control-card';
import { NotificationPrefsCard } from '../_components/notification-prefs-card';
import { TestEmailButton } from '../_components/test-email-button';
import { EnableWebPushButton } from '../_components/enable-web-push-button';
import { SettingsRow } from '../_components/settings-row';
import { RowDivider } from '../_components/row-divider';
import { IconMail, IconBell } from '@tabler/icons-react';
import { getServerEnv } from '@/lib/env';
import { cn } from '@/lib/cn';
import { listPushSubscriptions } from '@hamafx/ai';

export const metadata: Metadata = { title: 'Notifications | Settings | HamaFX' };
export const revalidate = 60;

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = session.user.id;
  const db = getDb();

  const [settings] = await db
    .select({ notificationPreferences: schema.userSettings.notificationPreferences })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));

  const noiseConfig = settings?.notificationPreferences && typeof settings.notificationPreferences === 'object'
    ? (settings.notificationPreferences as Record<string, unknown>).noiseConfig as NoiseConfig | undefined
    : undefined;

  const notificationPrefs = settings?.notificationPreferences as Record<string, Record<string, boolean>> | null;

  const env = getServerEnv();
  const emailReady = Boolean(env.RESEND_API_KEY) && Boolean(env.ALERT_FROM_EMAIL);
  const pushReady = Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY);

  let pushDevices = 0;
  try {
    const subs = await listPushSubscriptions(userId);
    pushDevices = subs.length;
  } catch {
    // silently skip
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Notifications</h2>
        <p className="text-fg-subtle text-sm">Alert channels, test buttons, noise control, and notification preferences.</p>
      </div>

      {/* Channel Test Buttons */}
      <section className="border border-border bg-bg-elev-1 rounded-sm flex flex-col gap-1 p-4">
        <header className="flex items-center gap-3 pb-2">
          <h3 className="text-fg text-base font-semibold tracking-tight">Test Channels</h3>
        </header>

        <SettingsRow
          icon={<IconMail className="size-4" />}
          label="Email"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={emailReady} />
              <span>Send a test email to verify your Resend configuration</span>
            </span>
          }
          stack
          action={<TestEmailButton />}
        />

        <RowDivider />

        <RowDivider />

        <SettingsRow
          icon={<IconBell className="size-4 text-brand" />}
          label="Web push"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={pushReady} />
              <span>
                {pushReady
                  ? `${pushDevices} device${pushDevices === 1 ? '' : 's'} subscribed`
                  : 'Browser push not configured'}
              </span>
            </span>
          }
          stack
          action={<EnableWebPushButton />}
        />
      </section>

      <NoiseControlCard initialConfig={noiseConfig ?? null} />
      <NotificationPrefsCard initialPrefs={notificationPrefs} />
    </div>
  );
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-bold uppercase tabular-nums ring-1',
        ready
          ? 'bg-success/10 text-success ring-success/30'
          : 'bg-bg-elev-2 text-fg-subtle ring-divider',
      )}
    >
      <span aria-hidden className={ready ? 'bg-success size-1 rounded-sm' : 'bg-fg-subtle size-1 rounded-sm'} />
      {ready ? 'Ready' : 'Off'}
    </span>
  );
}
