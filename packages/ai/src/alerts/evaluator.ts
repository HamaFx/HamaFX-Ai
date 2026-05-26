// Alert evaluator. Pure-ish core (decideMatch) + an orchestrator
// (evaluateAlerts) that fans out data fetches and writes back to the DB.
//
// Semantics: LEVEL alerts (one-shot). When the latest reading meets the
// rule, we fire once, set firedAt, deactivate. Re-arming is the user's call
// (toggle active or edit). This sidesteps the cross-detection complexity
// (no need to track previous state) and matches how a user phrases "alert
// me when X hits Y".
//
// A future Phase 2 follow-up can add proper crossing semantics by storing
// the previous-tick value in the rule JSON.

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

import { deliverAlert, type DeliveryResult } from './delivery';
import { listEvaluable } from './persistence';

// ---------------------------------------------------------------------------
// Rule decision: does this rule's reading meet the trigger?
// Pure function of inputs + rule — easy to unit test.
// ---------------------------------------------------------------------------

export interface RuleReading {
  /** The numeric value compared against `rule.level`. */
  value: number;
  /** Optional source label that ends up in the notification body. */
  source: string;
}

/** "above" → reading >= level; "below" → reading <= level. */
export function decideMatch(direction: 'above' | 'below', value: number, level: number): boolean {
  return direction === 'above' ? value >= level : value <= level;
}

// ---------------------------------------------------------------------------
// Per-rule readings.
// ---------------------------------------------------------------------------

async function readPriceRule(
  rule: Extract<AlertRule, { type: 'priceCross' }>,
): Promise<RuleReading> {
  const tick: Tick = await getPrice(rule.symbol);
  return { value: tick.mid, source: tick.source };
}

async function readCandleRule(
  rule: Extract<AlertRule, { type: 'candleClose' }>,
): Promise<RuleReading | null> {
  // We need the most recent CLOSED bar. Twelve Data's `time_series` includes
  // the in-progress bar at the tail; we drop it by checking whether the bar's
  // open time + tf duration is in the past. Fetch a couple extra so we
  // always have a closed bar to look at.
  const candles = await getCandles(rule.symbol, rule.tf, { count: 4 });
  const last = lastClosedBar(candles, rule.tf);
  if (!last) return null;
  return { value: last.c, source: last.source };
}

async function readIndicatorRule(
  rule: Extract<AlertRule, { type: 'indicatorCross' }>,
): Promise<RuleReading | null> {
  const parsed = parseIndicatorSpec(rule.indicator);
  if (!parsed) return null;
  const candles = await getCandles(rule.symbol, rule.tf, { count: 250 });
  if (candles.length === 0) return null;

  const result = computeIndicator({
    symbol: rule.symbol,
    tf: rule.tf,
    kind: parsed.kind,
    params: parsed.params,
    candles,
  });

  // Take the latest non-null point. For composite indicators (macd/bollinger/
  // pivots) we pick a sensible default scalar: macd line, bollinger middle,
  // pivot point.
  for (let i = result.values.length - 1; i >= 0; i -= 1) {
    const v = result.values[i];
    if (v == null) continue;
    if (typeof v === 'number') return { value: v, source: `${parsed.kind}@${rule.tf}` };
    if (typeof v === 'object') {
      if ('macd' in v && typeof v.macd === 'number')
        return { value: v.macd, source: `macd@${rule.tf}` };
      if ('middle' in v && typeof v.middle === 'number')
        return { value: v.middle, source: `bollinger.middle@${rule.tf}` };
      if ('pp' in v && typeof v.pp === 'number')
        return { value: v.pp, source: `pivots.pp@${rule.tf}` };
    }
  }
  return null;
}

/**
 * Parse a free-form indicator spec like "rsi:14", "ema:50", "macd:12,26,9".
 * Returns null on garbage so a misconfigured rule doesn't crash the cron.
 */
function parseIndicatorSpec(
  spec: string,
): { kind: IndicatorKind; params: Record<string, number> } | null {
  const [head, tail] = spec.toLowerCase().split(':');
  if (!head) return null;
  const known: readonly IndicatorKind[] = [
    'sma',
    'ema',
    'rsi',
    'macd',
    'atr',
    'bollinger',
    'pivots',
  ];
  if (!known.includes(head as IndicatorKind)) return null;
  const kind = head as IndicatorKind;
  const nums = (tail ?? '')
    .split(',')
    .map(Number)
    .filter((n) => !Number.isNaN(n));

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
    return { kind, params: {} };
  }
  // sma, ema, rsi, atr — single period.
  return { kind, params: { period: nums[0] ?? defaultPeriod(kind) } };
}

function defaultPeriod(kind: IndicatorKind): number {
  return kind === 'rsi' || kind === 'atr' ? 14 : 20;
}

function tfMs(tf: Timeframe): number {
  switch (tf) {
    case '1m':
      return 60_000;
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1d':
      return 24 * 60 * 60_000;
    case '1w':
      return 7 * 24 * 60 * 60_000;
  }
}

function lastClosedBar(candles: Candle[], tf: Timeframe): Candle | null {
  const cutoff = Date.now() - tfMs(tf);
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const bar = candles[i]!;
    if (bar.t <= cutoff) return bar;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Orchestrator — what the cron handler calls.
// ---------------------------------------------------------------------------

export interface EvaluatorEnv {
  RESEND_API_KEY?: string | undefined;
  ALERT_FROM_EMAIL?: string | undefined;
  ALERT_TO_EMAIL?: string | undefined;
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
  const env: EvaluatorEnv = opts.env ?? {
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? undefined,
    ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL ?? undefined,
    ALERT_TO_EMAIL: process.env.ALERT_TO_EMAIL ?? undefined,
  };

  let matched = 0;
  let fired = 0;
  let skipped = 0;
  const errors: EvaluationResult['errors'] = [];
  const deliveries: DeliveryResult[] = [];

  for (const alert of alerts) {
    if (opts.signal?.aborted) break;
    try {
      const reading = await readRule(alert.rule);
      if (!reading) {
        skipped += 1;
        continue;
      }
      const isMatch = decideMatch(alert.rule.direction, reading.value, alert.rule.level);
      if (!isMatch) continue;
      matched += 1;

      // Deliver across all configured channels. The delivery layer owns the
      // markFired call: it only marks the alert fired AFTER Resend returns
      // 2xx (see Requirements 7.5, 7.6 and packages/ai/src/alerts/delivery.ts).
      // If delivery fails, the alert stays active so the next cron tick retries.
      const result = await deliverAlert({ alert, reading, env });
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

async function readRule(rule: AlertRule): Promise<RuleReading | null> {
  switch (rule.type) {
    case 'priceCross':
      return readPriceRule(rule);
    case 'candleClose':
      return readCandleRule(rule);
    case 'indicatorCross':
      return readIndicatorRule(rule);
  }
}

// Re-exports so callers can run the orchestrator AND build human-readable
// labels for the same rule shape.
export function describeRule(rule: AlertRule): string {
  const sym: Symbol = rule.symbol;
  switch (rule.type) {
    case 'priceCross':
      return `${sym} price ${rule.direction} ${rule.level}`;
    case 'candleClose':
      return `${sym} ${rule.tf} close ${rule.direction} ${rule.level}`;
    case 'indicatorCross':
      return `${sym} ${rule.tf} ${rule.indicator} ${rule.direction} ${rule.level}`;
  }
}
