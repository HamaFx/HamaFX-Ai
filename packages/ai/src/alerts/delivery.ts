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

// Notification delivery. Phase 1d ships email via Resend (free tier).
// Telegram + web-push are stubbed so the schema/UI can already accept them
// — they'll wire up in Phase 2 per docs/10-roadmap.md.
//
// We use plain fetch against Resend's API to avoid an extra dep; their API
// is a single POST with a JSON body.
//
// Ordering contract (Requirements 7.5, 7.6):
//   1. Build the email payload.
//   2. POST to Resend and await the response.
//   3. On 2xx → call markFired, then return ok.
//   4. On non-2xx (or fetch error) → log the Resend status + truncated body
//      and return without calling markFired so the next cron tick retries.

import type { Alert } from '@hamafx/shared';

import { describeRule, type EvaluatorEnv, type RuleReading } from './evaluator';
import { markFiredForAlert as markFired } from './persistence';
import {
  deletePushSubscription,
  listPushSubscriptions,
} from '../push/persistence';
import { sendWebPush } from '../push/send';

export interface DeliveryResult {
  alertId: string;
  channel: string;
  ok: boolean;
  message?: string;
}

interface DeliverArgs {
  alert: Alert;
  reading: RuleReading;
  env: EvaluatorEnv;
}

export async function deliverAlert({ alert, reading, env }: DeliverArgs): Promise<DeliveryResult> {
  // Pick the first configured channel that can actually deliver. Iterating
  // over alert.channels means the user controls priority.
  for (const ch of alert.channels) {
    if (ch === 'email') {
      const r = await deliverEmail({ alert, reading, env });
      if (r.ok || r.message?.startsWith('not configured')) return r;
    }
    if (ch === 'telegram') {
      const r = await deliverTelegram({ alert, reading, env });
      if (r.ok || r.message?.startsWith('not configured')) return r;
    }
    if (ch === 'web-push') {
      const r = await deliverWebPush({ alert, reading, env });
      if (r.ok || r.message?.startsWith('not configured')) return r;
    }
  }
  return { alertId: alert.id, channel: 'none', ok: false, message: 'no channels' };
}

async function deliverEmail({ alert, reading, env }: DeliverArgs): Promise<DeliveryResult> {
  if (!env.RESEND_API_KEY || !env.ALERT_FROM_EMAIL || !env.ALERT_TO_EMAIL) {
    // No Resend call happens, so there is no 2xx and we deliberately do NOT
    // call markFired. The alert will keep matching every cron tick until the
    // user either deactivates it or fills in the env vars — which is the
    // signal the spec wants (Requirement 7.5 conditions on env vars present).
    console.warn('[alerts] email channel not configured (RESEND_*); skipping');
    return {
      alertId: alert.id,
      channel: 'email',
      ok: false,
      message: 'not configured (RESEND_API_KEY / ALERT_FROM_EMAIL / ALERT_TO_EMAIL missing)',
    };
  }

  const subject = `HamaFX-Ai · ${describeRule(alert.rule)}`;
  const body = renderEmailBody(alert, reading);

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.ALERT_FROM_EMAIL,
        to: [env.ALERT_TO_EMAIL],
        subject,
        text: body,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    console.error(`[alerts] resend fetch failed for alert ${alert.id}: ${msg}`);
    return {
      alertId: alert.id,
      channel: 'email',
      ok: false,
      message: msg,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const truncated = text.slice(0, 200);
    // Log here so the failure is visible in Vercel function logs even though
    // the evaluator only surfaces the DeliveryResult upward.
    console.error(`[alerts] resend HTTP ${res.status} for alert ${alert.id}: ${truncated}`);
    return {
      alertId: alert.id,
      channel: 'email',
      ok: false,
      message: `resend HTTP ${res.status}: ${truncated}`,
    };
  }

  // 2xx response — only now do we mark the alert as fired. This is the single
  // point where markFired is called for the email channel; the evaluator does
  // not call it separately.
  await markFired(alert);
  return { alertId: alert.id, channel: 'email', ok: true };
}

function renderEmailBody(alert: Alert, reading: RuleReading): string {
  const lines = [
    describeRule(alert.rule),
    '',
    `Reading: ${reading.value} (source: ${reading.source})`,
    `Trigger level: ${alert.rule.level}`,
  ];
  if (alert.note) {
    lines.push('', 'Note:', alert.note);
  }
  lines.push('', '— HamaFX-Ai');
  return lines.join('\n');
}


// ---------------------------------------------------------------------------
// Telegram (Phase 2)
// ---------------------------------------------------------------------------
//
// Same ordering contract as the email path: POST first, await the response,
// only call `markFired` after a 2xx. On non-2xx the alert is left
// un-marked-as-fired so the next cron tick retries.
//
// We use MarkdownV2 for formatting, which requires escaping a specific set
// of reserved characters in any user-controlled text. `escapeMd` below
// covers the full set listed in https://core.telegram.org/bots/api#markdownv2-style.

const TELEGRAM_API = 'https://api.telegram.org';

async function deliverTelegram({ alert, reading, env }: DeliverArgs): Promise<DeliveryResult> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn('[alerts] telegram channel not configured (TELEGRAM_*); skipping');
    return {
      alertId: alert.id,
      channel: 'telegram',
      ok: false,
      message: 'not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing)',
    };
  }

  const subject = describeRule(alert.rule);
  const body = renderTelegramBody(alert, reading);
  const text = `*${escapeMd(subject)}*\n\n${escapeMd(body)}`;

  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Analyze Setup', callback_data: `/committee ${'symbol' in alert.rule ? alert.rule.symbol : ''}` },
              { text: '🔕 Snooze 1h', callback_data: `/snooze ${alert.id}` },
            ],
            [
              { text: '📝 Log to Journal', callback_data: `/log ${'symbol' in alert.rule ? alert.rule.symbol : ''} triggered ${'level' in alert.rule ? alert.rule.level : ''}` }
            ]
          ]
        }
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    console.error(`[alerts] telegram fetch failed for alert ${alert.id}: ${msg}`);
    return { alertId: alert.id, channel: 'telegram', ok: false, message: msg };
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error(`[alerts] telegram HTTP ${res.status} for alert ${alert.id}: ${txt.slice(0, 200)}`);
    return {
      alertId: alert.id,
      channel: 'telegram',
      ok: false,
      message: `telegram HTTP ${res.status}: ${txt.slice(0, 200)}`,
    };
  }

  await markFired(alert);
  return { alertId: alert.id, channel: 'telegram', ok: true };
}

function renderTelegramBody(alert: Alert, reading: RuleReading): string {
  const lines = [
    `Reading: ${reading.value} (${reading.source})`,
    `Trigger: ${alert.rule.level}`,
  ];
  if (alert.note) {
    lines.push('', alert.note);
  }
  return lines.join('\n');
}

/**
 * Escape MarkdownV2 reserved characters per Telegram's spec. Apply to any
 * user-controlled string before interpolating into a `parse_mode: MarkdownV2`
 * message body.
 */
export function escapeMd(s: string): string {
  return s.replace(/[\\_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}


// ---------------------------------------------------------------------------
// Web Push (Phase 3)
// ---------------------------------------------------------------------------
//
// Same ordering contract as email/Telegram: we only call `markFired` after
// every active subscription returned 2xx (or all returned 410/404, in
// which case the dead subscriptions are removed and the alert is still
// marked fired so the cron loop doesn't keep re-evaluating it).
//
// On a single non-2xx, non-410 response we leave the alert un-fired so the
// next cron tick retries — matching the email/Telegram retry semantics.

async function deliverWebPush({ alert, reading, env }: DeliverArgs): Promise<DeliveryResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return {
      alertId: alert.id,
      channel: 'web-push',
      ok: false,
      message: 'not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing)',
    };
  }

  const subs = await listPushSubscriptions(alert.userId);
  if (subs.length === 0) {
    return {
      alertId: alert.id,
      channel: 'web-push',
      ok: false,
      message: 'not configured (no push subscriptions registered)',
    };
  }

  const payload = JSON.stringify({
    title: `HamaFX-Ai · ${describeRule(alert.rule)}`,
    body: renderEmailBody(alert, reading),
    url: '/alerts',
  });

  let allOkOrGone = true;
  let anyOk = false;
  for (const sub of subs) {
    const r = await sendWebPush(sub, payload, {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: env.VAPID_SUBJECT,
    });
    if (r.ok) {
      anyOk = true;
      continue;
    }
    if (r.status === 410 || r.status === 404) {
      // Dead subscription — drop it and keep going. We don't count this as
      // a failure for the markFired decision; the alert was effectively
      // delivered to every still-valid subscriber.
      console.warn(
        `[alerts] dropping dead push subscription ${sub.id} (HTTP ${r.status}) for alert ${alert.id}`,
      );
      await deletePushSubscription(alert.userId, sub.id);
      continue;
    }
    allOkOrGone = false;
    console.error(
      `[alerts] web-push HTTP ${r.status} for alert ${alert.id} sub ${sub.id}: ${r.message ?? ''}`,
    );
  }

  if (!allOkOrGone) {
    return {
      alertId: alert.id,
      channel: 'web-push',
      ok: false,
      message: 'one or more pushes failed',
    };
  }

  if (!anyOk) {
    // Every active subscription returned 410/404 — none delivered. Still
    // mark the alert fired so we don't re-evaluate it forever; the user
    // can re-subscribe and the next matching alert will fire normally.
    console.warn(
      `[alerts] all push subscriptions were dead for alert ${alert.id}; marking fired anyway`,
    );
  }

  await markFired(alert);
  return { alertId: alert.id, channel: 'web-push', ok: true };
}

// Hoist renderEmailBody so deliverWebPush above can read it. It was already
// defined as a function declaration earlier in the file, so this comment is
// purely a reading-aid.
