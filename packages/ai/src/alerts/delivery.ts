// Notification delivery. Phase 1d ships email via Resend (free tier).
// Telegram + web-push are stubbed so the schema/UI can already accept them
// — they'll wire up in Phase 2 per docs/10-roadmap.md.
//
// We use plain fetch against Resend's API to avoid an extra dep; their API
// is a single POST with a JSON body.

import type { Alert } from '@hamafx/shared';

import { describeRule, type RuleReading } from './evaluator';
import type { EvaluatorEnv } from './evaluator';

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
      return {
        alertId: alert.id,
        channel: 'telegram',
        ok: false,
        message: 'telegram delivery deferred to Phase 2',
      };
    }
    if (ch === 'web-push') {
      return {
        alertId: alert.id,
        channel: 'web-push',
        ok: false,
        message: 'web-push delivery deferred to Phase 3',
      };
    }
  }
  return { alertId: alert.id, channel: 'none', ok: false, message: 'no channels' };
}

async function deliverEmail({ alert, reading, env }: DeliverArgs): Promise<DeliveryResult> {
  if (!env.RESEND_API_KEY || !env.ALERT_FROM_EMAIL || !env.ALERT_TO_EMAIL) {
    // Don't error — log + continue. Alert still gets marked fired so we don't
    // re-fire next cron beat once delivery is configured.
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
    return {
      alertId: alert.id,
      channel: 'email',
      ok: false,
      message: err instanceof Error ? err.message : 'fetch failed',
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return {
      alertId: alert.id,
      channel: 'email',
      ok: false,
      message: `resend HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }
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
