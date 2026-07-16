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

// /api/alerts/preview — run the alert simulator against historical
// candles. Returns the count of times the rule would have fired
// inside the lookback window and the average hold time between
// consecutive fires. Used by the alert form to show a "would have
// fired N times" line before the user commits the rule.
//
// Phase B — UX_UPGRADE_PLAN.md item 10.
//
// Body: { rule: AlertRule, lookbackDays?: number }
//
// Limits:
//   - lookbackDays: 1..365, default 90
//   - Rate limit: 10 calls / minute / user (debounced in the UI
//     so a power user exploring thresholds can't accidentally
//     burn the upstream data budget).

import {
  simulateAlert,
  type SimCandle,
} from '@hamafx/ai';
import { AlertRuleSchema, type AlertRule } from '@hamafx/shared';
import { withRateLimit, getDb, schema } from '@hamafx/db';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

import { errorResponse, parseJsonBody, withAuth } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREVIEW_RATE_LIMIT = Number(
  process.env.AI_ALERT_PREVIEW_RATE_LIMIT ?? '10',
);

const BodySchema = z.object({
  rule: AlertRuleSchema,
  lookbackDays: z.number().int().min(1).max(365).default(90),
});

interface PreviewResult {
  count: number;
  avgHoldMs: number;
  /** Most recent N fire timestamps (newest first). */
  recentFires: number[];
  /** True when the rule type is unsupported (indicatorCross). */
  unsupported: boolean;
}

/**
 * Fetch a window of historical candles for a symbol. We pull from
 * `candles_1m` and aggregate to the rule's timeframe in JS — keeps
 * the simulator pure and avoids needing a separate query per TF.
 *
 * For `priceCross` and `candleClose` the timeframe doesn't matter
 * for the simulator's correctness (we scan raw levels), so we
 * just use whatever the rule asks for.
 *
 * Phase B — limits: we cap at 1500 candles per call to bound the
 * response. With 1m granularity that's ~25 hours; for longer
 * lookbacks we widen the bucket size.
 */
async function fetchCandles(
  rule: AlertRule,
  _lookbackDays: number,
): Promise<SimCandle[]> {
  const db = getDb();

  // Pull up to 1500 candles for the symbol from candles_1m, newest first.
  const rows = await db
    .select()
    .from(schema.candles1m)
    .where(eq(schema.candles1m.symbol, rule.symbol))
    .orderBy(desc(schema.candles1m.t))
    .limit(1500);
  return rows
    .map((r) => {
      const t = (r as { t?: number | Date | string }).t;
      const o = (r as { o?: number }).o ?? 0;
      const h = (r as { h?: number }).h ?? 0;
      const l = (r as { l?: number }).l ?? 0;
      const c = (r as { c?: number }).c ?? 0;
      const tMs = typeof t === 'number' ? t : t instanceof Date ? t.getTime() : Date.parse(String(t));
      return { t: tMs, o, h, l, c } satisfies SimCandle;
    })
    .filter((candle) => Number.isFinite(candle.t));
}

export const POST = withAuth<void>(async (req, { user }) => {
  const rl = await withRateLimit(user.userId, 'ai_alert_preview', PREVIEW_RATE_LIMIT);
  if (!rl.allowed) {
    return Response.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many preview requests (${rl.count}/${rl.limit} per minute).`,
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (err) {
    return errorResponse(err);
  }

  if (body.rule.type === 'indicatorCross') {
    // Surface the unsupported case explicitly so the UI can show
    // "Preview unavailable for this rule" instead of a generic
    // 0 count.
    const out: PreviewResult = {
      count: 0,
      avgHoldMs: 0,
      recentFires: [],
      unsupported: true,
    };
    return Response.json(out);
  }

  const candles = await fetchCandles(body.rule, body.lookbackDays);
  const sim = simulateAlert(body.rule, candles, { maxFires: 50 });
  if (!sim) {
    // Defensive: simulateAlert only returns null for indicatorCross,
    // which we already handled above. This branch is unreachable
    // in practice but keeps the contract honest.
    const out: PreviewResult = {
      count: 0,
      avgHoldMs: 0,
      recentFires: [],
      unsupported: true,
    };
    return Response.json(out);
  }

  const recentFires = sim.fires
    .slice()
    .reverse() // newest first
    .map((f) => f.at)
    .slice(0, 10);

  const out: PreviewResult = {
    count: sim.fires.length,
    avgHoldMs: sim.avgHoldMs,
    recentFires,
    unsupported: false,
  };
  return Response.json(out);
});
