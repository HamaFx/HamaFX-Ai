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

// Alert evaluator. Pure-ish core (decideMatch/decideCross) + an orchestrator
// (evaluateAlerts) that fans out data fetches and writes back to the DB.
//
// Semantics:
//   - priceCross / candleClose — LEVEL alerts (one-shot). Fire the moment the
//     latest reading meets the rule, then deactivate.
//   - indicatorCross — true CROSSING semantics. We need the previous-tick
//     reading to detect a transition through the level; that baseline lives
//     on the rule itself (`rule.previousValue`). On the first tick it is
//     null and the alert never fires immediately on creation, even when
//     the indicator already sits past the threshold.
//
// In both flavours, delivery owns the `markFired` write; the alert stays
// active until a channel returns 2xx so transient delivery errors retry on
// the next cron tick.

import { schema } from '@hamafx/db';
import { getDb } from '../db';
import { eq, inArray } from 'drizzle-orm';
import { getCandles, getPrice } from '@hamafx/data';
import { computeIndicator } from '@hamafx/indicators';
import {
  type AlertRule,
  type Candle,
  type IndicatorKind,
  type Symbol,
  type Tick,
  type Timeframe,
} from '@hamafx/shared';
import { msPerTimeframe } from '@hamafx/shared';
import { createCategorizedLogger } from '@hamafx/shared/logger';

import { deliverAlert, type DeliveryResult } from './delivery';
import { listEvaluable, setRulePreviousValue } from './persistence';
import { specFromRule, type RuleReading } from './spec';
import { alertRuleRegistry } from './rule-registry';

const elog = createCategorizedLogger('ai', { component: 'alerts-evaluator' });

// ---------------------------------------------------------------------------
// PF-08 — Alert rule specification evaluation.
//
// The decision logic (decideMatch / decideCross) has been migrated to
// the specification pattern in `spec.ts`. The `specFromRule()` factory
// converts a persisted AlertRule into a composable AlertSpec, and the
// spec decides whether the reading satisfies the trigger.
//
// The legacy `decideMatch` and `decideCross` exports are re-exported
// from `spec.ts` for backward compatibility.
// ---------------------------------------------------------------------------

export { decideMatch, decideCross } from './spec';
export type { RuleReading, CrossContext } from './spec';

// ---------------------------------------------------------------------------
// Per-rule readings.
// ---------------------------------------------------------------------------

/**
 * Parse a strict indicator spec into an `(kind, params)` pair.
 *
 *   sma | ema | rsi | atr           → optional `:n`
 *   macd                            → optional `:fast,slow,signal`
 *   bollinger                       → optional `:period,multiplier`
 *   pivots                          → no params
 *
 * Returns null if the input doesn't match the regex above. The previous
 * permissive parser silently dropped trailing junk (e.g. "rsi:14:bogus"
 * became `rsi(14)`), which produced alerts that didn't match the user's
 * stated intent.
 */
const INDICATOR_SPEC_RE = /^(sma|ema|rsi|atr|macd|bollinger|pivots)(?::([0-9]+(?:,[0-9]+){0,2}))?$/i;

export function parseIndicatorSpec(
  spec: string,
): { kind: IndicatorKind; params: Record<string, number> } | null {
  if (typeof spec !== 'string') return null;
  const m = INDICATOR_SPEC_RE.exec(spec.trim());
  if (!m) return null;
  const kind = m[1]!.toLowerCase() as IndicatorKind;
  const nums = (m[2] ?? '')
    .split(',')
    .filter((s) => s.length > 0)
    .map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;

  if (kind === 'macd') {
    return {
      kind,
      params: {
        fast: nums[0] ?? 12,
        slow: nums[1] ?? 26,
        signal: nums[2] ?? 9,
      },
    };
  }
  if (kind === 'bollinger') {
    return { kind, params: { period: nums[0] ?? 20, multiplier: nums[1] ?? 2 } };
  }
  if (kind === 'pivots') {
    if (nums.length > 0) return null;
    return { kind, params: {} };
  }
  // sma, ema, rsi, atr — single optional period.
  if (nums.length > 1) return null;
  return { kind, params: { period: nums[0] ?? defaultPeriod(kind) } };
}

function defaultPeriod(kind: IndicatorKind): number {
  return kind === 'rsi' || kind === 'atr' ? 14 : 20;
}


export function lastClosedBar(candles: Candle[], tf: Timeframe): Candle | null {
  // A bar is closed iff its open time + timeframe duration is in the past
  // (i.e. the next bar has already opened). The previous implementation
  // looked for bars whose OPEN time was ≥ 1 timeframe ago, which returned
  // the bar BEFORE the most recently closed one — alerts on a 1h chart
  // compared against a candle that closed roughly 2h ago.
  const tfDur = msPerTimeframe(tf);
  const now = Date.now();
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const bar = candles[i]!;
    if (bar.t + tfDur <= now) return bar;
  }
  return null;
}

type AlertObj = { id: string; rule: AlertRule };

async function readReadingsBatch(alerts: AlertObj[]): Promise<Map<string, RuleReading | null | Error>> {
  // 1. Group dependencies
  const neededPrices = new Set<Symbol>();
  const neededCandles = new Map<string, { symbol: Symbol; tf: Timeframe; count: number }>();
  
  for (const a of alerts) {
    const { rule } = a;
    if (rule.type === 'priceCross') neededPrices.add(rule.symbol);
    else if (rule.type === 'candleClose') {
      const key = `${rule.symbol}-${rule.tf}`;
      const existing = neededCandles.get(key);
      neededCandles.set(key, { symbol: rule.symbol, tf: rule.tf, count: Math.max(existing?.count ?? 0, 4) });
    } else if (rule.type === 'indicatorCross') {
      if (!parseIndicatorSpec(rule.indicator)) continue;
      const key = `${rule.symbol}-${rule.tf}`;
      const existing = neededCandles.get(key);
      neededCandles.set(key, { symbol: rule.symbol, tf: rule.tf, count: Math.max(existing?.count ?? 0, 250) });
    }
  }

  // 2. Pre-fetch all dependencies in parallel
  const priceCache = new Map<Symbol, Tick | Error>();
  const candleCache = new Map<string, Candle[] | Error>();

  const fetches: Promise<void>[] = [];
  
  for (const sym of neededPrices) {
    fetches.push(getPrice(sym).then(t => { priceCache.set(sym, t); }).catch(e => { priceCache.set(sym, e instanceof Error ? e : new Error(String(e))); }));
  }
  for (const [key, req] of neededCandles.entries()) {
    fetches.push(getCandles(req.symbol, req.tf, { count: req.count }).then(c => { candleCache.set(key, c); }).catch(e => { candleCache.set(key, e instanceof Error ? e : new Error(String(e))); }));
  }

  await Promise.all(fetches);

  // 3. Evaluate each rule purely from the prefetched cache
  const results = new Map<string, RuleReading | null | Error>();

  for (const a of alerts) {
    const { rule } = a;
    try {
      if (rule.type === 'priceCross') {
        const tick = priceCache.get(rule.symbol);
        if (tick instanceof Error) throw tick;
        if (!tick) { results.set(a.id, null); continue; }
        results.set(a.id, { value: tick.mid, source: tick.source });
      } else if (rule.type === 'candleClose') {
        const key = `${rule.symbol}-${rule.tf}`;
        const candles = candleCache.get(key);
        if (candles instanceof Error) throw candles;
        if (!candles || candles.length === 0) { results.set(a.id, null); continue; }
        const last = lastClosedBar(candles, rule.tf);
        if (!last) results.set(a.id, null);
        else results.set(a.id, { value: last.c, source: last.source });
      } else if (rule.type === 'indicatorCross') {
        const parsed = parseIndicatorSpec(rule.indicator);
        if (!parsed) { results.set(a.id, null); continue; }
        const key = `${rule.symbol}-${rule.tf}`;
        const candles = candleCache.get(key);
        if (candles instanceof Error) throw candles;
        if (!candles || candles.length === 0) { results.set(a.id, null); continue; }
        
        const result = computeIndicator({
          symbol: rule.symbol,
          tf: rule.tf,
          kind: parsed.kind,
          params: parsed.params,
          candles,
        });

        let found: RuleReading | null = null;
        for (let i = result.values.length - 1; i >= 0; i -= 1) {
          const v = result.values[i];
          if (v == null) continue;
          if (typeof v === 'number') { found = { value: v, source: `${parsed.kind}@${rule.tf}` }; break; }
          if (typeof v === 'object') {
            if ('macd' in v && typeof v.macd === 'number') { found = { value: v.macd, source: `macd@${rule.tf}` }; break; }
            if ('middle' in v && typeof v.middle === 'number') { found = { value: v.middle, source: `bollinger.middle@${rule.tf}` }; break; }
            if ('pp' in v && typeof v.pp === 'number') { found = { value: v.pp, source: `pivots.pp@${rule.tf}` }; break; }
          }
        }
        results.set(a.id, found);
      }
    } catch (err) {
      results.set(a.id, err instanceof Error ? err : new Error(String(err)));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Orchestrator — what the cron handler calls.
// ---------------------------------------------------------------------------

export interface EvaluatorEnv {
  RESEND_API_KEY?: string | undefined;
  ALERT_FROM_EMAIL?: string | undefined;
  ALERT_TO_EMAIL?: string | undefined;
  TELEGRAM_BOT_TOKEN?: string | undefined;
  TELEGRAM_CHAT_ID?: string | undefined;
  /** VAPID keypair for the web-push channel (RFC 8292). */
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
  VAPID_SUBJECT?: string | undefined;
}

export interface EvaluationResult {
  total: number;
  matched: number;
  fired: number;
  skipped: number;
  errors: Array<{ alertId: string; message: string }>;
  deliveries: DeliveryResult[];
}

export async function evaluateAlerts(
  opts: {
    env?: EvaluatorEnv;
    signal?: AbortSignal;
  } = {},
): Promise<EvaluationResult> {
  const alerts = await listEvaluable();
  const globalEnv: EvaluatorEnv = opts.env ?? {
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? undefined,
    ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL ?? undefined,
    ALERT_TO_EMAIL: process.env.ALERT_TO_EMAIL ?? undefined, // Fallback
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? undefined,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? undefined,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? undefined,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? undefined,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? undefined,
  };

  const db = getDb();
  const userIds = Array.from(new Set(alerts.map((a) => a.userId)));
  const userEnvMap = new Map<string, EvaluatorEnv>();

  if (userIds.length > 0) {
    const userRows = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        alertEmail: schema.userSettings.alertEmail,
        telegramBotToken: schema.userSettings.telegramBotToken,
        telegramChatId: schema.userSettings.telegramChatId,
      })
      .from(schema.users)
      .leftJoin(schema.userSettings, eq(schema.users.id, schema.userSettings.userId))
      .where(inArray(schema.users.id, userIds));

    for (const row of userRows) {
      userEnvMap.set(row.id, {
        ...globalEnv,
        ALERT_TO_EMAIL: row.alertEmail || row.email || globalEnv.ALERT_TO_EMAIL,
        TELEGRAM_BOT_TOKEN: row.telegramBotToken || globalEnv.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: row.telegramChatId || globalEnv.TELEGRAM_CHAT_ID,
      });
    }
  }

  let matched = 0;
  let fired = 0;
  let skipped = 0;
  const errors: EvaluationResult['errors'] = [];
  const deliveries: DeliveryResult[] = [];

  // Phase 2 hardening §9 — read all rules' inputs in parallel. 
  // We group dependencies (symbol, tf) and pre-fetch them concurrently
  // so we never execute duplicated upstream calls in this worker boundary.
  const batchMap = await readReadingsBatch(alerts);

  const readings = alerts.map((alert) => {
    const res = batchMap.get(alert.id);
    if (res instanceof Error) {
      return { alert, reading: null, error: res };
    }
    return { alert, reading: res ?? null, error: null };
  });

  for (const { alert, reading, error } of readings) {
    if (opts.signal?.aborted) break;
    if (error) {
      errors.push({
        alertId: alert.id,
        message: error.message,
      });
      continue;
    }
    try {
      if (!reading) {
        skipped += 1;
        continue;
      }

      // indicatorCross uses true crossing semantics: compare the previous
      // baseline (persisted on the rule) against the current value. If
      // there's no baseline yet, seed it and skip — the alert never fires
      // immediately on creation.
      // PF-08 — Use the specification pattern to evaluate the rule.
      const spec = specFromRule(alert.rule);
      const cross = alert.rule.type === 'indicatorCross'
        ? { previousValue: alert.rule.previousValue ?? null }
        : undefined;
      const isMatch = spec.isSatisfiedBy(reading, cross);

      if (alert.rule.type === 'indicatorCross' && !isMatch) {
        // Seed / refresh the baseline so the next tick has the right
        // anchor. Best-effort: failures here just mean the next tick
        // re-seeds.
        try {
          await setRulePreviousValue(alert.id, alert.rule, reading.value);
        } catch (err) {
          elog.warn('setRulePreviousValue failed', { id: alert.id, err: String(err) });
        }
        continue;
      }

      if (!isMatch) continue;

      matched += 1;

      // Deliver across all configured channels. The delivery layer owns the
      // markFired call: it only marks the alert fired AFTER Resend returns
      // 2xx (see Requirements 7.5, 7.6 and packages/ai/src/alerts/delivery.ts).
      // If delivery fails, the alert stays active so the next cron tick retries.
      const alertEnv = userEnvMap.get(alert.userId) ?? globalEnv;
      const result = await deliverAlert({ alert, reading, env: alertEnv });
      deliveries.push(result);
      if (result.ok) fired += 1;
    } catch (err) {
      errors.push({
        alertId: alert.id,
        message: err instanceof Error ? err.message : 'unknown evaluator error',
      });
    }
  }

  return { total: alerts.length, matched, fired, skipped, errors, deliveries };
}

// Re-exports so callers can run the orchestrator AND build human-readable
// labels for the same rule shape.
export function describeRule(rule: AlertRule): string {
  return alertRuleRegistry.get(rule.type).describe(rule);
}
