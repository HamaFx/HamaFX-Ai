// System status card — high-density "everything wired" overview so the
// user can see at a glance whether each notification channel is ready
// without diving into the test buttons. Server component; reads env vars
// directly + counts push subscriptions.

import { listPushSubscriptions } from '@hamafx/ai';
import { CheckCircle2, CircleAlert } from 'lucide-react';

import { cn } from '@/lib/cn';

interface ChannelStatus {
  label: string;
  ready: boolean;
  detail: string;
}

async function buildStatuses(): Promise<{
  channels: ChannelStatus[];
  pushCount: number;
  databaseConnected: boolean;
}> {
  const env = process.env;
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
  try {
    const subs = await listPushSubscriptions();
    pushCount = subs.length;
    databaseConnected = true;
  } catch {
    /* ignore — DB might be misconfigured; the channels block still shows */
  }

  // Patch the web push detail with the live count.
  const webPush = channels[2];
  if (webPush?.ready) {
    webPush.detail =
      pushCount > 0
        ? `${pushCount} device${pushCount === 1 ? '' : 's'} subscribed`
        : 'Configured · 0 devices';
  }

  return { channels, pushCount, databaseConnected };
}

export async function SystemStatusCard() {
  const { channels, databaseConnected } = await buildStatuses();
  const allReady = channels.every((c) => c.ready) && databaseConnected;

  return (
    <section
      aria-labelledby="system-status-heading"
      className="card-premium relative flex flex-col gap-4 overflow-hidden p-4"
    >
      <header className="flex items-center justify-between gap-3">
        <h2
          id="system-status-heading"
          className="text-fg-subtle text-[10px] font-semibold uppercase tracking-wider"
        >
          System status
        </h2>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1',
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
              <span className="text-fg-subtle truncate text-[11px] tabular-nums">
                {c.detail}
              </span>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tabular-nums ring-1',
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

      {/* Database connection */}
      <div className="border-divider/60 -mx-4 border-t px-4 pt-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-lg',
              databaseConnected
                ? 'bg-bull/15 text-bull'
                : 'bg-bear/15 text-bear',
            )}
          >
            {databaseConnected ? (
              <CheckCircle2 className="size-4" strokeWidth={2.25} />
            ) : (
              <CircleAlert className="size-4" strokeWidth={2.25} />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-fg text-sm font-semibold">Database</span>
            <span className="text-fg-subtle text-[11px]">
              {databaseConnected ? 'Postgres + pgvector reachable' : 'Connection failed'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
