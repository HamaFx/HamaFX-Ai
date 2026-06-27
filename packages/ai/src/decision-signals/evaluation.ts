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

// F1.5 — Outcome Evaluation Service.
//
// Orchestrates the cron-driven evaluation: fetches active signals that
// are past their horizon, retrieves forward daily bars from the data
// adapter, runs the backtest engine, and records outcomes.
//
// Idempotent: uses ON CONFLICT DO NOTHING on (signal_id, horizon) so
// re-running the cron for the same day won't duplicate outcomes.

import { getCandles } from '@hamafx/data';
import {
  DEFAULT_EVAL_CONFIG,
  EVAL_HORIZONS,
  HORIZON_DAYS,
  type EvaluationConfig,
  type EvalHorizon,
} from '@hamafx/shared';

import { candlesToDailyBars, evaluateSignal } from './backtest-engine';
import {
  listSignalsNeedingEvaluation,
  maybeCloseSignal,
  recordOutcome,
  recordUnable,
} from './persistence';
import type { SignalForEvaluation } from './types';

export interface CronEvaluationResult {
  processed: number;
  evaluated: number;
  unable: number;
  errors: number;
  note: string;
}

export async function evaluatePendingSignals(
  config: EvaluationConfig = DEFAULT_EVAL_CONFIG,
  horizons: readonly EvalHorizon[] = EVAL_HORIZONS,
): Promise<CronEvaluationResult> {
  const candidates = await listSignalsNeedingEvaluation(horizons);

  let evaluated = 0;
  let unable = 0;
  let errors = 0;

  for (const signal of candidates) {
    const signalForEval: SignalForEvaluation = {
      id: signal.id,
      bias: signal.bias as 'bullish' | 'bearish' | 'neutral',
      anchorPrice: signal.anchorPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      anchorAt: signal.anchorAt.getTime(),
      symbol: signal.symbol,
    };

    for (const horizon of horizons) {
      const days = HORIZON_DAYS[horizon];

      try {
        // Fetch daily candles covering the forward window.
        // We request `days + 2` bars to ensure we have enough after the anchor.
        const candles = await getCandles(signal.symbol, '1d', {
          count: days + 2,
        });

        // Filter to bars strictly after the anchor date.
        const anchorMs = signal.anchorAt.getTime();
        const forwardCandles = candles.filter((c: { t: number }) => c.t > anchorMs);

        // Convert to daily bars and trim to the horizon window.
        const dailyBars = candlesToDailyBars(forwardCandles).slice(0, days);

        const evalResult = evaluateSignal(signalForEval, dailyBars, config);

        if ('evalStatus' in evalResult && evalResult.evalStatus === 'unable') {
          unable++;
          await recordUnable(signal.id, horizon, evalResult.reason, config.engineVersion);
        } else if ('outcome' in evalResult) {
          evaluated++;
          await recordOutcome(signal.id, horizon, evalResult, config.engineVersion);
        }
      } catch {
        // Data provider failure — record as unable.
        errors++;
        await recordUnable(signal.id, horizon, 'data_fetch_failed', config.engineVersion);
      }
    }

    // Mark signal as closed once all horizons are evaluated.
    await maybeCloseSignal(signal.id);
  }

  return {
    processed: candidates.length,
    evaluated,
    unable,
    errors,
    note: `evaluated=${evaluated} unable=${unable} errors=${errors}`,
  };
}