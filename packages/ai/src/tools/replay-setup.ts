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

// Tool: replay_setup.
//
// Lightweight rule replay over recent candles. Two rule kinds today:
// `ema_cross` and `rsi_threshold`. Stop and target are expressed in ATR
// multiples (default) or fixed pips. Trades exit on the first bar that
// touches stop/target, or after `maxBars` (forced exit at close). No
// look-ahead.

import { getCandles } from '@hamafx/data';
import { atr, ema, rsi } from '@hamafx/indicators';
import {
  pipSize,
  ReplaySetupInputSchema,
  type Candle,
  type ReplaySetupOutput,
  type ReplayTrade,
} from '@hamafx/shared';
import { tool } from 'ai';
import type { z } from 'zod';

const InputSchema = ReplaySetupInputSchema;

declare module '@hamafx/shared' {
  interface ToolIOMap {
    replay_setup: { input: z.infer<typeof InputSchema> };
  }
}

export const replaySetupTool = tool({
  description:
    "Replay a closed-set rule over recent candles and return per-trade entries/exits + win-rate / avg R / total R. Two rule kinds: `ema_cross` (fast/slow EMA crossover) and `rsi_threshold` (RSI crossing a level). Stop and target are ATR multiples (default 1.5 / 2 RR) or fixed pips. Use when the user describes a setup ('does an EMA50 cross with RSI > 60 actually work on EURUSD 1H'). Returns thin=true when fewer than 5 trades fired.",
  inputSchema: InputSchema,
  execute: async (input): Promise<ReplaySetupOutput> => {
    const { symbol, tf, windowBars, rule, exit } = input;
    const need = Math.min(windowBars + 50, 2000);
    const candles = await getCandles(symbol, tf, { count: need });

    const ruleLabel = describeRule(rule);
    if (candles.length < 30) {
      return emptyResult(symbol, tf, ruleLabel);
    }

    const atrSeries = atr(candles, 14);
    const signals = computeSignals(rule, candles);

    const trades: ReplayTrade[] = [];
    for (const sig of signals) {
      const trade = simulateTrade({
        candles,
        atrSeries,
        index: sig.index,
        side: sig.side,
        entryPrice: candles[sig.index]!.c,
        symbol,
        exit,
      });
      if (trade) trades.push(trade);
    }

    const wins = trades.filter((t) => t.rMultiple > 0.05).length;
    const losses = trades.filter((t) => t.rMultiple < -0.05).length;
    const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
    const avgR = trades.length === 0 ? 0 : totalR / trades.length;
    const hitRate = trades.length === 0 ? 0 : wins / trades.length;

    return {
      symbol,
      tf,
      asOf: Date.now(),
      ruleLabel,
      trades,
      count: trades.length,
      wins,
      losses,
      hitRate,
      avgR,
      totalR,
      thin: trades.length < 5,
      notes: buildNotes({ count: trades.length, wins, losses, avgR, totalR }),
    };
  },
});

// ---------------------------------------------------------------------------
// signals
// ---------------------------------------------------------------------------

interface Signal {
  index: number;
  side: 'long' | 'short';
}

function computeSignals(
  rule: z.infer<typeof InputSchema>['rule'],
  candles: Candle[],
): Signal[] {
  if (rule.kind === 'ema_cross') {
    const fastSeries = ema(candles, rule.fast);
    const slowSeries = ema(candles, rule.slow);
    const out: Signal[] = [];
    for (let i = Math.max(rule.slow, rule.fast) + 1; i < candles.length - 1; i += 1) {
      const fNow = fastSeries[i];
      const sNow = slowSeries[i];
      const fPrev = fastSeries[i - 1];
      const sPrev = slowSeries[i - 1];
      if (fNow == null || sNow == null || fPrev == null || sPrev == null) continue;
      if (rule.side === 'long' && fPrev <= sPrev && fNow > sNow) out.push({ index: i, side: 'long' });
      if (rule.side === 'short' && fPrev >= sPrev && fNow < sNow) out.push({ index: i, side: 'short' });
    }
    return out;
  }

  // rsi_threshold
  const rsiSeries = rsi(candles, rule.period);
  const out: Signal[] = [];
  for (let i = rule.period + 1; i < candles.length - 1; i += 1) {
    const now = rsiSeries[i];
    const prev = rsiSeries[i - 1];
    if (now == null || prev == null) continue;
    if (rule.side === 'long' && prev <= rule.threshold && now > rule.threshold) {
      out.push({ index: i, side: 'long' });
    }
    if (rule.side === 'short' && prev >= rule.threshold && now < rule.threshold) {
      out.push({ index: i, side: 'short' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// trade simulation
// ---------------------------------------------------------------------------

interface SimulateArgs {
  candles: Candle[];
  atrSeries: (number | null)[];
  index: number;
  side: 'long' | 'short';
  entryPrice: number;
  symbol: z.infer<typeof InputSchema>['symbol'];
  exit: z.infer<typeof InputSchema>['exit'];
}

function simulateTrade(args: SimulateArgs): ReplayTrade | null {
  const { candles, atrSeries, index, side, entryPrice, symbol, exit } = args;

  let stopOffset: number;
  let targetOffset: number;
  if (exit.unit === 'atr') {
    const atrAtEntry = atrSeries[index];
    if (atrAtEntry === null || atrAtEntry === undefined || !Number.isFinite(atrAtEntry)) {
      return null;
    }
    stopOffset = atrAtEntry * exit.stopMult;
    targetOffset = atrAtEntry * exit.targetMult;
  } else {
    if (exit.stopPips == null || exit.targetPips == null) return null;
    const pip = pipSize(symbol);
    stopOffset = exit.stopPips * pip;
    targetOffset = exit.targetPips * pip;
  }

  const stop = side === 'long' ? entryPrice - stopOffset : entryPrice + stopOffset;
  const target = side === 'long' ? entryPrice + targetOffset : entryPrice - targetOffset;

  const lastBarIdx = Math.min(index + exit.maxBars, candles.length - 1);
  for (let j = index + 1; j <= lastBarIdx; j += 1) {
    const bar = candles[j]!;
    if (side === 'long') {
      // Tie-break: assume stop fills before target if both touched in the same bar.
      if (bar.l <= stop) {
        return makeTrade({
          entryAt: candles[index]!.t,
          exitAt: bar.t,
          side,
          entry: entryPrice,
          exit: stop,
          stop,
          target,
          reason: 'sl',
          barsInTrade: j - index,
        });
      }
      if (bar.h >= target) {
        return makeTrade({
          entryAt: candles[index]!.t,
          exitAt: bar.t,
          side,
          entry: entryPrice,
          exit: target,
          stop,
          target,
          reason: 'tp',
          barsInTrade: j - index,
        });
      }
    } else {
      if (bar.h >= stop) {
        return makeTrade({
          entryAt: candles[index]!.t,
          exitAt: bar.t,
          side,
          entry: entryPrice,
          exit: stop,
          stop,
          target,
          reason: 'sl',
          barsInTrade: j - index,
        });
      }
      if (bar.l <= target) {
        return makeTrade({
          entryAt: candles[index]!.t,
          exitAt: bar.t,
          side,
          entry: entryPrice,
          exit: target,
          stop,
          target,
          reason: 'tp',
          barsInTrade: j - index,
        });
      }
    }
  }

  // maxBars hit — exit at the last bar's close.
  const last = candles[lastBarIdx]!;
  return makeTrade({
    entryAt: candles[index]!.t,
    exitAt: last.t,
    side,
    entry: entryPrice,
    exit: last.c,
    stop,
    target,
    reason: 'time',
    barsInTrade: lastBarIdx - index,
  });
}

interface MakeTradeArgs {
  entryAt: number;
  exitAt: number;
  side: 'long' | 'short';
  entry: number;
  exit: number;
  stop: number;
  target: number;
  reason: 'tp' | 'sl' | 'time';
  barsInTrade: number;
}

function makeTrade(args: MakeTradeArgs): ReplayTrade {
  const risk = Math.abs(args.entry - args.stop);
  const pnl = args.side === 'long' ? args.exit - args.entry : args.entry - args.exit;
  const rMultiple = risk > 0 ? pnl / risk : 0;
  return {
    entryAt: args.entryAt,
    exitAt: args.exitAt,
    side: args.side,
    entry: args.entry,
    exit: args.exit,
    stop: args.stop,
    target: args.target,
    reason: args.reason,
    rMultiple,
    barsInTrade: args.barsInTrade,
  };
}

// ---------------------------------------------------------------------------
// labels + notes + empty
// ---------------------------------------------------------------------------

function describeRule(rule: z.infer<typeof InputSchema>['rule']): string {
  if (rule.kind === 'ema_cross') {
    return `${rule.side === 'long' ? 'Long' : 'Short'} EMA${rule.fast}/${rule.slow} cross`;
  }
  return `${rule.side === 'long' ? 'Long' : 'Short'} RSI(${rule.period}) crossing ${rule.threshold}`;
}

function buildNotes(args: {
  count: number;
  wins: number;
  losses: number;
  avgR: number;
  totalR: number;
}): string {
  if (args.count === 0) return 'No signals fired in the window.';
  return `${args.count} trade${args.count === 1 ? '' : 's'} (${args.wins}W / ${args.losses}L) · avg ${args.avgR.toFixed(2)}R · total ${args.totalR.toFixed(2)}R.`;
}

function emptyResult(
  symbol: z.infer<typeof InputSchema>['symbol'],
  tf: z.infer<typeof InputSchema>['tf'],
  ruleLabel: string,
): ReplaySetupOutput {
  return {
    symbol,
    tf,
    asOf: Date.now(),
    ruleLabel,
    trades: [],
    count: 0,
    wins: 0,
    losses: 0,
    hitRate: 0,
    avgR: 0,
    totalR: 0,
    thin: true,
    notes: 'Insufficient candles to replay.',
  };
}
