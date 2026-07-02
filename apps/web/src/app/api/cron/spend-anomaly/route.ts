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

// GET /api/cron/spend-anomaly — Phase 4 task 4.9.
//
// Runs the operator-side spend-anomaly detector. Scans daily_ai_spend
// for users whose today's spend exceeds 3σ above their 14-day baseline.
// Captures anomalies to Sentry + pages the operator via email/Telegram.
//
// Cadence: every 30 minutes on the GCE VM (systemd timer). Independent
// of any user-set monthlyBudgetLimit.

import { getDb } from '@hamafx/db';
import { sql } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';

import { withCronAuth } from '@/lib/cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface AnomalyRow {
  user_id: string;
  total_usd_cents: number | string;
  mean_cents: number | string;
  sd_cents: number | string;
}

export async function GET(req: Request): Promise<Response> {
  return withCronAuth(req, async () => {
    const db = getDb();

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

    for (const a of anomalies) {
      const spent = Number(a.total_usd_cents) / 100;
      const mean = Number(a.mean_cents) / 100;
      const sd = Number(a.sd_cents) / 100;
      const zScore = sd > 0 ? (spent - mean) / sd : Infinity;

      Sentry.captureMessage(
        `AI spend anomaly: user ${a.user_id} spent $${spent.toFixed(2)} today (baseline mean=$${mean.toFixed(2)}, sd=$${sd.toFixed(2)}, z=${zScore.toFixed(1)})`,
        {
          level: 'warning',
          tags: { component: 'cron', job: 'spend-anomaly' },
          extra: { userId: a.user_id, spentUsd: spent, baselineMeanUsd: mean, baselineSdUsd: sd, zScore },
        },
      );
    }

    // Page operator via email/Telegram.
    if (anomalies.length > 0) {
      const summary = anomalies
        .map((a) => `user ${a.user_id}: $${(Number(a.total_usd_cents) / 100).toFixed(2)}`)
        .join('\n');
      const subject = `[HamaFX-Ai] SPEND ANOMALY: ${anomalies.length} user(s) exceeded baseline`;
      const body = `Anomalous AI spend detected:\n\n${summary}\n\nReview immediately.\n\n— HamaFX-Ai Spend Anomaly Detector`;

      if (process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL && process.env.ALERT_TO_EMAIL) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [process.env.ALERT_TO_EMAIL], subject, text: body }),
        }).catch(() => undefined);
      }

      if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `⚠️ ${subject}\n\n${body}` }),
        }).catch(() => undefined);
      }
    }

    return {
      processed: anomalies.length,
      note: anomalies.length === 0 ? 'no anomalies' : `${anomalies.length} anomaly/anomalies detected and reported`,
    };
  });
}
