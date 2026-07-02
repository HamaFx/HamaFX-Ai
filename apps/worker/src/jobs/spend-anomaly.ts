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

// Phase 4 task 4.9 — operator-side spend-anomaly detector.
//
// Runs a baseline/z-score query against the existing daily_ai_spend
// rollup. When a user's daily spend exceeds 3 standard deviations above
// their 14-day trailing baseline (or an absolute $5/day floor), the
// anomaly is captured to Sentry and the operator is paged via
// email/Telegram — independent of any user-set monthlyBudgetLimit.
//
// SQL adapted from review 07 §3.4(b).

import { getDb } from '@hamafx/db';
import { sql } from 'drizzle-orm';
import * as Sentry from '@sentry/node';

import type { JobContext, JobResult } from './types.js';

interface AnomalyRow {
  user_id: string;
  total_usd_cents: number | string;
  mean_cents: number | string;
  sd_cents: number | string;
}

export async function runSpendAnomaly(ctx: JobContext): Promise<JobResult> {
  const db = getDb();

  // Per-user daily spend + a 14-day trailing baseline.
  // z > 3 OR absolute > $5/day (500 cents) floor.
  const rows = await db.execute<AnomalyRow>(sql`
    WITH baseline AS (
      SELECT user_id,
             avg(total_usd_cents)   AS mean_cents,
             stddev_pop(total_usd_cents) AS sd_cents
      FROM daily_ai_spend
      WHERE day >= to_char(now() - interval '15 days', 'YYYY-MM-DD')
        AND day <  to_char(now(), 'YYYY-MM-DD')
      GROUP BY user_id
    ),
    today AS (
      SELECT user_id, total_usd_cents
      FROM daily_ai_spend
      WHERE day = to_char(now(), 'YYYY-MM-DD')
    )
    SELECT t.user_id, t.total_usd_cents, b.mean_cents, b.sd_cents
    FROM today t JOIN baseline b USING (user_id)
    WHERE t.total_usd_cents > GREATEST(b.mean_cents + 3 * COALESCE(b.sd_cents, 0), 500)
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows?: AnomalyRow[] }).rows ?? [];
  const anomalies = list as AnomalyRow[];

  if (anomalies.length === 0) {
    ctx.log.info('spend-anomaly: no anomalies detected');
    return { processed: 0, note: 'no anomalies' };
  }

  ctx.log.warn('spend-anomaly: anomalies detected', {
    count: anomalies.length,
    users: anomalies.map((a) => a.user_id),
  });

  // Capture each anomaly to Sentry.
  for (const a of anomalies) {
    const spent = Number(a.total_usd_cents) / 100;
    const mean = Number(a.mean_cents) / 100;
    const sd = Number(a.sd_cents) / 100;
    const zScore = sd > 0 ? (spent - mean) / sd : Infinity;

    Sentry.captureMessage(`AI spend anomaly: user ${a.user_id} spent $${spent.toFixed(2)} today (baseline mean=$${mean.toFixed(2)}, sd=$${sd.toFixed(2)}, z=${zScore.toFixed(1)})`, {
      level: 'warning',
      tags: { component: 'worker', job: 'spend-anomaly' },
      extra: {
        userId: a.user_id,
        spentUsd: spent,
        baselineMeanUsd: mean,
        baselineSdUsd: sd,
        zScore,
      },
    });
  }

  // Page the operator via email/Telegram if configured.
  const operatorEmail = process.env.ALERT_TO_EMAIL;
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  const anomalySummary = anomalies
    .map((a) => {
      const spent = Number(a.total_usd_cents) / 100;
      const mean = Number(a.mean_cents) / 100;
      return `user ${a.user_id}: $${spent.toFixed(2)} (baseline $${mean.toFixed(2)}/day)`;
    })
    .join('\n');

  const subject = `[HamaFX-Ai] SPEND ANOMALY: ${anomalies.length} user(s) exceeded baseline`;
  const body = `The following users have anomalous AI spend today:\n\n${anomalySummary}\n\nReview immediately.\n\n— HamaFX-Ai Spend Anomaly Detector`;

  // Email via Resend if configured.
  if (process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL && operatorEmail) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM_EMAIL,
          to: [operatorEmail],
          subject,
          text: body,
        }),
      });
    } catch (err) {
      ctx.log.error('spend-anomaly: failed to send operator email', { err });
    }
  }

  // Telegram if configured.
  if (telegramBotToken && telegramChatId) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: `⚠️ ${subject}\n\n${body}`,
        }),
      });
    } catch (err) {
      ctx.log.error('spend-anomaly: failed to send operator Telegram message', { err });
    }
  }

  return {
    processed: anomalies.length,
    note: `${anomalies.length} anomaly/anomalies detected and reported`,
  };
}
