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

/**
 * Alert rule simulator — "would this have fired historically?"
 *
 * Phase B — UX_UPGRADE_PLAN.md item 10.
 *
 * Pure function: takes a rule and a window of historical candles
 * (already fetched by the caller — this module does not touch
 * network or DB) and returns a list of firing timestamps. We
 * deliberately keep this minimal:
 *
 *   - priceCross: a candle fires if its [low, high] band straddles
 *     the level for the matching direction. "above" fires when the
 *     candle's high >= level; "below" fires when the candle's low
 *     <= level. This matches the live evaluator's behavior in
 *     packages/ai/src/alerts/evaluator.ts.
 *   - candleClose: a candle fires if its close satisfies the rule.
 *   - indicatorCross: not supported. The plan marks this as
 *     "best-effort" — the live evaluator needs a baseline value
 *     across time, which requires re-computing the indicator on
 *     every historical candle. We return null and the UI surfaces
 *     a "Preview unavailable for this rule" message.
 *
 * Tested in packages/ai/test/alert-simulate.test.ts.
 */

import type { AlertRule } from '@hamafx/shared';

export interface SimCandle {
  /** Candle open time, ms since epoch. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface SimFire {
  /** Candle time of the firing bar. */
  at: number;
  /** Price level the rule crossed. */
  price: number;
}

export interface SimResult {
  fires: SimFire[];
  /** Average hold time in ms between consecutive fires (0 when <2 fires). */
  avgHoldMs: number;
}

/**
 * Run the simulator over a candle window. The result is sorted
 * by `at` ascending and capped at `maxFires` to bound the response
 * size for the chat alert form (default 50).
 */
export function simulateAlert(
  rule: AlertRule,
  candles: readonly SimCandle[],
  opts: { maxFires?: number } = {},
): SimResult | null {
  const maxFires = opts.maxFires ?? 50;
  const fires: SimFire[] = [];

  if (rule.type === 'priceCross') {
    for (const c of candles) {
      const fired =
        rule.direction === 'above' ? c.h >= rule.level : c.l <= rule.level;
      if (fired) {
        fires.push({ at: c.t, price: rule.level });
        if (fires.length >= maxFires) break;
      }
    }
  } else if (rule.type === 'candleClose') {
    for (const c of candles) {
      const fired =
        rule.direction === 'above' ? c.c >= rule.level : c.c <= rule.level;
      if (fired) {
        fires.push({ at: c.t, price: c.c });
        if (fires.length >= maxFires) break;
      }
    }
  } else {
    // indicatorCross — not supported in v1. The live evaluator
    // requires a rolling baseline that this module does not
    // recompute. Returning null lets the UI show a friendly
    // "Preview unavailable" message.
    return null;
  }

  let avgHoldMs = 0;
  if (fires.length >= 2) {
    let total = 0;
    for (let i = 1; i < fires.length; i += 1) {
      total += fires[i]!.at - fires[i - 1]!.at;
    }
    avgHoldMs = total / (fires.length - 1);
  }

  return { fires, avgHoldMs };
}
