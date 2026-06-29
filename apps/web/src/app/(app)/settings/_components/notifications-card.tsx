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

// Notifications card — Email / Telegram / Web push, in one structured
// list with status indicators. Server component; the action islands are
// the existing Test*Button / EnableWebPushButton client components.

import Link from 'next/link';
import { listPushSubscriptions } from '@hamafx/ai';
import { Bell, Mail, Send } from 'lucide-react';

import { cn } from '@/lib/cn';
import { getServerEnv } from '@/lib/env';

import { EnableWebPushButton } from './enable-web-push-button';
import { TestEmailButton } from './test-email-button';
import { TestTelegramButton } from './test-telegram-button';
import { SettingsRow } from './settings-row';

export async function NotificationsCard({ userId }: { userId: string }) {
  const env = getServerEnv();
  const emailReady = Boolean(env.RESEND_API_KEY) && Boolean(env.ALERT_FROM_EMAIL);
  const telegramReady = Boolean(env.TELEGRAM_BOT_TOKEN) && Boolean(env.TELEGRAM_CHAT_ID);
  const pushReady = Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY);

  let pushDevices = 0;
  try {
    const subs = await listPushSubscriptions(userId);
    pushDevices = subs.length;
  } catch {
    console.error('[settings] failed to list push subscriptions');
  }

  return (
    <section
      aria-labelledby="notifications-heading"
      className="border border-divider bg-bg-elev-1 rounded-lg flex flex-col gap-1 p-4"
    >
      <header className="flex items-center gap-3 pb-2">
        <h2
          id="notifications-heading"
          className="text-fg text-base font-semibold tracking-tight"
        >
          Notifications
        </h2>
        <p className="text-fg-subtle ml-auto text-caption uppercase tracking-wider">
          Test channels
        </p>
      </header>

      <Link href="/settings/usage" className="block rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-bg-elev-2/60">
        <SettingsRow
          icon={<Mail className="size-4" />}
          iconColor="oklch(78% 0.16 78 / 0.18)"
          label="Email"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={emailReady} />
              <span>Configure email alerts and usage notifications</span>
            </span>
          }
          stack
          action={<TestEmailButton />}
        />
      </Link>

      <RowDivider />

      <Link href="/settings/telegram" className="block rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-bg-elev-2/60">
        <SettingsRow
          icon={<Send className="size-4" />}
          iconColor="oklch(74% 0.14 230 / 0.18)"
          label="Telegram"
          description={
            <span className="flex items-center gap-2">
              <StatusPill ready={telegramReady} />
              <span>Configure Telegram bot and test messages</span>
            </span>
          }
          stack
          action={<TestTelegramButton />}
        />
      </Link>

      <RowDivider />

      <Link href="/settings" className="block rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-bg-elev-2/60">
        <SettingsRow
          icon={<Bell className="size-4" />}
          iconColor="oklch(70% 0.14 285 / 0.18)"
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
      </Link>
    </section>
  );
}

function RowDivider() {
  return <div className="border-divider/60 -mx-4 my-1 border-t" />;
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-bold uppercase tabular-nums ring-1',
        ready
          ? 'bg-bull/10 text-bull ring-bull/30'
          : 'bg-bg-elev-2 text-fg-subtle ring-divider',
      )}
    >
      <span aria-hidden className={ready ? 'bg-bull size-1 rounded-full' : 'bg-fg-subtle size-1 rounded-full'} />
      {ready ? 'Ready' : 'Off'}
    </span>
  );
}
