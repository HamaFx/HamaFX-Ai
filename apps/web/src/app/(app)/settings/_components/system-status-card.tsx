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

// System status card — high-density "everything wired" overview so the
// user can see at a glance whether each notification channel is ready
// without diving into the test buttons. Server component; reads env vars
// directly + counts push subscriptions.

import { listPushSubscriptions } from '@hamafx/ai';
import { getDb } from '@hamafx/db';
import { getMarketPhase, describeMarketPhase } from '@hamafx/shared';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { sql } from 'drizzle-orm';

import { cn } from '@/lib/cn';
import { getServerEnv } from '@/lib/env';

interface ChannelStatus {
  label: string;
  ready: boolean;
  detail: string;
}

async function buildStatuses(userId: string): Promise<{
  channels: ChannelStatus[];
  pushCount: number;
  databaseConnected: boolean;
  stuckJobs: number;
  recentErrors: number;
}> {
  const env = getServerEnv();
  const channels: ChannelStatus[] = [
    {
      label: 'Email',
      ready:
        Boolean(env.RESEND_API_KEY) &&
        Boolean(env.ALERT_FROM_EMAIL) &&
        Boolean(env.ALERT_TO_EMAIL),
      detail: env.ALERT_TO_EMAIL ? `→ ${env.ALERT_TO_EMAIL}` : 'Not configured',
    },
    {
      label: 'Telegram',
      ready: Boolean(env.TELEGRAM_BOT_TOKEN) && Boolean(env.TELEGRAM_CHAT_ID),
      detail: env.TELEGRAM_CHAT_ID
        ? `Chat ${env.TELEGRAM_CHAT_ID}`
        : 'Not configured',
    },
    {
      label: 'Web push',
      ready: Boolean(env.VAPID_PUBLIC_KEY) && Boolean(env.VAPID_PRIVATE_KEY),
      detail: env.VAPID_PUBLIC_KEY ? 'VAPID keys present' : 'Not configured',
    },
  ];

  let pushCount = 0;
  let databaseConnected = false;
  let stuckJobs = 0;
  let recentErrors = 0;
  try {
    const subs = await listPushSubscriptions(userId);
    pushCount = subs.length;
    databaseConnected = true;

    // OBS-04: Query cron_runs for stuck/errored jobs in last 24h.
    try {
      const db = getDb();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [row] = await db.execute<{ stuck: string; errors: string }>(sql`
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'started' AND started_at < now() - INTERVAL '5 minutes'
          )::text AS stuck,
          COUNT(*) FILTER (WHERE status = 'error')::text AS errors
        FROM cron_runs
        WHERE started_at >= ${since}
      `);
      stuckJobs = Number((row as { stuck: string; errors: string })?.stuck ?? 0);
      recentErrors = Number((row as { stuck: string; errors: string })?.errors ?? 0);
    } catch {
      // cron_runs not yet migrated — silently skip
    }
  } catch {
    console.error('[settings] failed to list push subscriptions');
  }

  // Patch the web push detail with the live count.
  const webPush = channels[2];
  if (webPush?.ready) {
    webPush.detail =
      pushCount > 0
        ? `${pushCount} device${pushCount === 1 ? '' : 's'} subscribed`
        : 'Configured · 0 devices';
  }

  return { channels, pushCount, databaseConnected, stuckJobs, recentErrors };
}

export async function SystemStatusCard({ userId }: { userId: string }) {
  const { channels, databaseConnected, stuckJobs, recentErrors } = await buildStatuses(userId);
  const cronHealthy = stuckJobs === 0 && recentErrors === 0;
  const allReady = channels.every((c) => c.ready) && databaseConnected;

  // F6 — Current market phase for the system status card.
  const marketPhase = getMarketPhase();
  const marketPhaseDescription = describeMarketPhase(marketPhase);

  return (
    <section
      aria-labelledby="system-status-heading"
      className="border border-divider bg-bg-elev-1 rounded-lg relative flex flex-col gap-4 overflow-hidden p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h2
          id="system-status-heading"
          className="text-fg-subtle text-caption font-semibold uppercase tracking-wider"
        >
          System status
        </h2>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-bold uppercase tracking-wide ring-1',
            allReady
              ? 'bg-bull/10 text-bull ring-bull/30'
              : 'bg-warn/10 text-warn ring-warn/30',
          )}
        >
          {allReady ? (
            <>
              <span aria-hidden className="bg-bull size-1.5 rounded-full" />
              All systems
            </>
          ) : (
            <>
              <CircleAlert className="size-3" />
              Some channels off
            </>
          )}
        </span>
      </header>

      <ul className="flex flex-col gap-2.5">
        {channels.map((c) => (
          <li
            key={c.label}
            className="flex items-center gap-3"
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-full',
                c.ready
                  ? 'bg-bull/15 text-bull'
                  : 'bg-bg-elev-2 text-fg-subtle',
              )}
            >
              {c.ready ? (
                <CheckCircle2 className="size-4" strokeWidth={2.25} />
              ) : (
                <CircleAlert className="size-4" strokeWidth={2.25} />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-fg text-sm font-semibold">{c.label}</span>
              <span className="text-fg-subtle truncate text-body-sm tabular-nums">
                {c.detail}
              </span>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-caption font-bold uppercase tabular-nums ring-1',
                c.ready
                  ? 'bg-bull/10 text-bull ring-bull/30'
                  : 'bg-bg-elev-2 text-fg-muted ring-divider',
              )}
            >
              {c.ready ? 'Ready' : 'Off'}
            </span>
          </li>
        ))}
      </ul>

      {/* Cron job health — OBS-04 */}
      <div className="border-divider/60 -mx-4 border-t px-4 pt-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-lg',
              cronHealthy ? 'bg-bull/15 text-bull' : 'bg-warn/15 text-warn',
            )}
          >
            {cronHealthy ? (
              <CheckCircle2 className="size-4" strokeWidth={2.25} />
            ) : (
              <CircleAlert className="size-4" strokeWidth={2.25} />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-fg text-sm font-semibold">Background jobs</span>
            <span className="text-fg-subtle text-body-sm">
              {cronHealthy
                ? 'All jobs healthy (last 24h)'
                : `${stuckJobs} stuck · ${recentErrors} error${recentErrors === 1 ? '' : 's'} (last 24h)`}
            </span>
          </div>
        </div>
      </div>

      {/* F6 — Market phase detection */}
      <div className="border-divider/60 -mx-4 border-t px-4 pt-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-lg',
              marketPhase.isOpen
                ? marketPhase.liquidity === 'high'
                  ? 'bg-bull/15 text-bull'
                  : marketPhase.liquidity === 'medium'
                    ? 'bg-warn/15 text-warn'
                    : 'bg-fg-muted/15 text-fg-muted'
                : 'bg-bg-elev-2 text-fg-subtle',
            )}
          >
            {marketPhase.isOpen ? (
              <CheckCircle2 className="size-4" strokeWidth={2.25} />
            ) : (
              <CircleAlert className="size-4" strokeWidth={2.25} />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-fg text-sm font-semibold">Market phase</span>
            <span className="text-fg-subtle text-body-sm">
              {marketPhaseDescription}
            </span>
          </div>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-caption font-bold uppercase tabular-nums ring-1',
              marketPhase.isOpen
                ? marketPhase.liquidity === 'high'
                  ? 'bg-bull/10 text-bull ring-bull/30'
                  : marketPhase.liquidity === 'medium'
                    ? 'bg-warn/10 text-warn ring-warn/30'
                    : 'bg-bg-elev-2 text-fg-muted ring-divider'
                : 'bg-bg-elev-2 text-fg-muted ring-divider',
            )}
          >
            {marketPhase.isOpen ? marketPhase.liquidity : 'Closed'}
          </span>
        </div>
      </div>
    </section>
  );
}
