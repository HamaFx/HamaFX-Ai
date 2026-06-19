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

// Output envelope returned by the `replay_setup` AI tool.
//
// Lightweight rule replay over recent candles. The `RuleSpec` is a
// closed-set DSL — no eval(), no untrusted code paths. Stops/targets are
// expressed as ATR multiples or fixed pips so the rule is symbol-agnostic.
//
// Source of truth: packages/ai/src/tools/replay-setup.ts execute() return type.

import { z } from 'zod';

import { SymbolSchema } from '../../symbols';
import { TimeframeSchema } from '../../timeframes';

export const ReplayRuleEmaCrossSchema = z.object({
  kind: z.literal('ema_cross'),
  /** EMA period for the fast leg. */
  fast: z.number().int().min(2).max(200),
  /** EMA period for the slow leg. */
  slow: z.number().int().min(3).max(500),
  /** "long" enters on fast crossing above slow. "short" inverse. */
  side: z.enum(['long', 'short']),
});

export const ReplayRuleRsiSchema = z.object({
  kind: z.literal('rsi_threshold'),
  period: z.number().int().min(2).max(100).default(14),
  /** Threshold value, e.g. 30 for "RSI crosses up through 30". */
  threshold: z.number().min(1).max(99),
  /** "long": RSI crossing UP through threshold. "short": crossing DOWN. */
  side: z.enum(['long', 'short']),
});

export const ReplayRuleSchema = z.discriminatedUnion('kind', [
  ReplayRuleEmaCrossSchema,
  ReplayRuleRsiSchema,
]);
export type ReplayRule = z.infer<typeof ReplayRuleSchema>;

export const ReplayExitSchema = z.object({
  /** Stop/target unit. ATR uses ATR(14) on the same timeframe. */
  unit: z.enum(['atr', 'pips']).default('atr'),
  /** ATR multiplier for stop, e.g. 1.5. Required when unit='atr'. */
  stopMult: z.number().min(0.1).max(10).default(1.5),
  /** Target multiplier (RR). Required when unit='atr'. */
  targetMult: z.number().min(0.1).max(10).default(2),
  /** Fixed-pip stop (when unit='pips'). */
  stopPips: z.number().positive().optional(),
  /** Fixed-pip target (when unit='pips'). */
  targetPips: z.number().positive().optional(),
  /** Hard cap on bars-in-trade before forced exit at market. */
  maxBars: z.number().int().min(1).max(500).default(100),
});
export type ReplayExit = z.infer<typeof ReplayExitSchema>;

export const ReplaySetupInputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema.default('1h'),
  /** Bars to scan. Caller controls latency vs sample size. */
  windowBars: z.number().int().min(50).max(2000).default(500),
  rule: ReplayRuleSchema,
  exit: ReplayExitSchema.default(ReplayExitSchema.parse({})),
});
export type ReplaySetupInput = z.infer<typeof ReplaySetupInputSchema>;

export const ReplayTradeSchema = z.object({
  /** ms epoch UTC of entry. */
  entryAt: z.number().int(),
  exitAt: z.number().int(),
  side: z.enum(['long', 'short']),
  entry: z.number(),
  exit: z.number(),
  stop: z.number(),
  target: z.number(),
  /** "tp" (target hit), "sl" (stop hit), "time" (maxBars reached). */
  reason: z.enum(['tp', 'sl', 'time']),
  rMultiple: z.number(),
  barsInTrade: z.number().int(),
});
export type ReplayTrade = z.infer<typeof ReplayTradeSchema>;

export const ReplaySetupOutputSchema = z.object({
  symbol: SymbolSchema,
  tf: TimeframeSchema,
  asOf: z.number().int(),
  ruleLabel: z.string(),
  trades: z.array(ReplayTradeSchema),
  count: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  hitRate: z.number().min(0).max(1),
  avgR: z.number(),
  totalR: z.number(),
  /** True when fewer than 5 trades fired — stats are noisy. */
  thin: z.boolean(),
  notes: z.string(),
});
export type ReplaySetupOutput = z.infer<typeof ReplaySetupOutputSchema>;
