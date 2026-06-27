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

// F1.4 — Backtest Engine.
//
// Pure logic — DB-agnostic. Operates on OHLC daily bars to evaluate
// whether a decision signal was correct. Forex-specific neutral band
// (1.0% vs DSA's 2.0%) because forex moves are tighter than equities.
//
// Outcome logic:
//   hit    = direction correct AND moved beyond neutral band (or hit target)
//   miss   = direction wrong (or hit stop)
//   neutral = within neutral band

import type { EvaluationConfig } from '@hamafx/shared';

import type {
  DailyBar,
  OutcomeResult,
  SignalForEvaluation,
  UnableResult,
  EngineEvaluationResult,
} from './types';

/**
 * Evaluate a single signal against forward daily bars.
 *
 * @param signal  The decision signal to evaluate.
 * @param forwardBars  Daily OHLC bars after the signal's anchor date.
 *                     Must be ordered oldest-first.
 * @param config  Evaluation parameters (neutral band, engine version).
 * @returns OutcomeResult on success, UnableResult when evaluation can't proceed.
 */
export function evaluateSignal(
  signal: SignalForEvaluation,
  forwardBars: DailyBar[],
  config: EvaluationConfig,
): EngineEvaluationResult {
  if (forwardBars.length < 1) {
    return { evalStatus: 'unable', reason: 'insufficient_forward_bars' } as UnableResult;
  }

  if (!signal.anchorPrice || signal.anchorPrice <= 0) {
    return { evalStatus: 'unable', reason: 'invalid_anchor_price' } as UnableResult;
  }

  const isBullish = signal.bias === 'bullish';
  let hitStop = false;
  let hitTarget = false;
  let firstHit: 'stop' | 'target' | 'neither' = 'neither';
  let firstHitDays: number | null = null;

  // Walk forward bars, detect first stop/target hit.
  for (let i = 0; i < forwardBars.length; i++) {
    const bar = forwardBars[i]!;

    if (signal.stopLoss !== null && signal.stopLoss !== undefined) {
      const stopHit = isBullish ? bar.low <= signal.stopLoss : bar.high >= signal.stopLoss;
      if (stopHit && firstHit === 'neither') {
        hitStop = true;
        firstHit = 'stop';
        firstHitDays = i + 1;
      }
    }

    if (signal.takeProfit !== null && signal.takeProfit !== undefined) {
      const targetHit = isBullish
        ? bar.high >= signal.takeProfit
        : bar.low <= signal.takeProfit;
      if (targetHit && firstHit === 'neither') {
        hitTarget = true;
        firstHit = 'target';
        firstHitDays = i + 1;
      }
    }

    // If both hit on the same bar, the first one checked (stop) wins.
    // This is conservative — assume the worst for the signal.
    if (firstHit !== 'neither') break;
  }

  const endPrice = forwardBars[forwardBars.length - 1]!.close;
  const priceReturnPct = ((endPrice - signal.anchorPrice) / signal.anchorPrice) * 100;
  const directionCorrect = isBullish ? priceReturnPct > 0 : priceReturnPct < 0;

  // Outcome logic:
  //   hit target → hit
  //   hit stop   → miss
  //   within neutral band → neutral
  //   otherwise → direction correct ? hit : miss
  let outcome: 'hit' | 'miss' | 'neutral';
  if (hitTarget) {
    outcome = 'hit';
  } else if (hitStop) {
    outcome = 'miss';
  } else if (Math.abs(priceReturnPct) < config.neutralBandPct) {
    outcome = 'neutral';
  } else {
    outcome = directionCorrect ? 'hit' : 'miss';
  }

  const result: OutcomeResult = {
    outcome,
    directionCorrect,
    priceReturnPct,
    hitStopLoss: hitStop,
    hitTakeProfit: hitTarget,
    firstHit,
    firstHitDays,
    endPrice,
  };

  return result;
}

/**
 * Convert Candle[] (from @hamafx/data) to DailyBar[] for the engine.
 * Aggregates intraday bars into daily bars if needed.
 */
export function candlesToDailyBars(
  candles: Array<{ t: number; h: number; l: number; c: number }>,
): DailyBar[] {
  if (candles.length === 0) return [];

  const dailyMap = new Map<string, { high: number; low: number; close: number }>();

  for (const candle of candles) {
    const date = new Date(candle.t).toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = dailyMap.get(date);
    if (existing) {
      existing.high = Math.max(existing.high, candle.h);
      existing.low = Math.min(existing.low, candle.l);
      existing.close = candle.c; // last bar of the day
    } else {
      dailyMap.set(date, { high: candle.h, low: candle.l, close: candle.c });
    }
  }

  return Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { high, low, close }]) => ({ date, high, low, close }));
}