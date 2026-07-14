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
import { IconMessageCircle } from '@tabler/icons-react';

import { auth } from '@/auth';
import { TelegramLinkCard } from '../_components/telegram-link-card';
import { TestTelegramButton } from '../_components/test-telegram-button';

export const metadata: Metadata = { title: 'Telegram | Settings | HamaFX' };

export default async function TelegramSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-fg text-lg font-semibold tracking-tight">Telegram Bot</h2>
        <p className="text-fg-subtle text-sm">Link your Telegram to control HamaFX with bot commands.</p>
      </div>

      <section className="rounded-sm border border-border bg-bg-elev-1 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <IconMessageCircle className="size-5 text-fg" />
          <h3 className="text-base font-semibold">Bot Linking</h3>
        </div>

        <TelegramLinkCard />
      </section>

      <section className="rounded-sm border border-border bg-bg-elev-1 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-fg-subtle">Test Notification</h3>
        <p className="text-sm text-fg-subtle">
          Send a test message to verify your Telegram bot is configured correctly.
        </p>
        <TestTelegramButton />
      </section>

      <section className="rounded-sm border border-border bg-bg-elev-1 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-fg-subtle">Available Commands</h3>
        <div className="grid gap-2 text-sm">
          {[
            { cmd: '/price <symbol>', desc: 'Get current price (e.g. /price XAUUSD)' },
            { cmd: '/analyze <symbol>', desc: 'Full AI analysis (e.g. /analyze EURUSD)' },
            { cmd: '/ask <question>', desc: 'Ask a question (e.g. /ask is gold bullish?)' },
            { cmd: '/chart <symbol>', desc: 'Chart snapshot link (e.g. /chart XAUUSD)' },
            { cmd: '/alert <symbol> > <price>', desc: 'Create price alert (e.g. /alert XAUUSD > 2700)' },
            { cmd: '/positions', desc: 'Show your open positions' },
            { cmd: '/track', desc: 'AI track record stats' },
            { cmd: '/status', desc: 'System status and overview' },
            { cmd: '/help', desc: 'List all commands' },
          ].map((item) => (
            <div key={item.cmd} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              <code className="rounded-sm bg-bg-elev-2 px-2 py-0.5 font-mono text-xs whitespace-nowrap sm:w-64">
                {item.cmd}
              </code>
              <span className="text-fg-subtle">{item.desc}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
