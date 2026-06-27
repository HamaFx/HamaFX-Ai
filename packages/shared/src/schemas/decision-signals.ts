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

// F1 — Zod schemas for decision signals, outcomes, feedback, and stats.
// These are the shared contract between the AI package, API routes, and UI.

import { z } from 'zod';

import { SymbolSchema } from '../symbols';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const DecisionActionSchema = z.enum([
  'buy',
  'sell',
  'hold',
  'reduce',
  'add',
  'avoid',
]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DecisionBiasSchema = z.enum(['bullish', 'bearish', 'neutral']);
export type DecisionBias = z.infer<typeof DecisionBiasSchema>;

export const SignalHorizonSchema = z.enum([
  'intraday',
  '1d',
  '3d',
  '5d',
  '10d',
  'swing',
]);
export type SignalHorizon = z.infer<typeof SignalHorizonSchema>;

export const SignalSourceTypeSchema = z.enum([
  'chat',
  'alert',
  'briefing',
  'manual',
]);
export type SignalSourceType = z.infer<typeof SignalSourceTypeSchema>;

export const SignalStatusSchema = z.enum([
  'active',
  'expired',
  'invalidated',
  'closed',
]);
export type SignalStatus = z.infer<typeof SignalStatusSchema>;

export const EvalStatusSchema = z.enum(['completed', 'unable']);
export type EvalStatus = z.infer<typeof EvalStatusSchema>;

export const OutcomeSchema = z.enum(['hit', 'miss', 'neutral']);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const FirstHitSchema = z.enum(['stop', 'target', 'neither']);
export type FirstHit = z.infer<typeof FirstHitSchema>;

export const FeedbackSchema = z.enum(['useful', 'not_useful']);
export type Feedback = z.infer<typeof FeedbackSchema>;

// Horizons that the cron evaluates (subset of SignalHorizon — excludes
// 'intraday' and 'swing' which are qualitative, not day-counted).
export const EVAL_HORIZONS = ['1d', '3d', '5d', '10d'] as const;
export type EvalHorizon = (typeof EVAL_HORIZONS)[number];

export const HORIZON_DAYS: Record<EvalHorizon, number> = {
  '1d': 1,
  '3d': 3,
  '5d': 5,
  '10d': 10,
};

// ---------------------------------------------------------------------------
// Decision Signal
// ---------------------------------------------------------------------------

export const DecisionSignalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  threadId: z.string().uuid().nullable(),
  messageId: z.string().uuid().nullable(),
  symbol: SymbolSchema,
  action: DecisionActionSchema,
  bias: DecisionBiasSchema,
  confidence: z.number().min(0).max(1).nullable(),
  entryLow: z.number().nullable(),
  entryHigh: z.number().nullable(),
  stopLoss: z.number().nullable(),
  takeProfit: z.number().nullable(),
  horizon: SignalHorizonSchema,
  anchorPrice: z.number(),
  anchorAt: z.number().int(),
  sourceType: SignalSourceTypeSchema,
  model: z.string().nullable(),
  analysisMode: z.string().nullable(),
  status: SignalStatusSchema,
  metadata: z.record(z.unknown()),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type DecisionSignal = z.infer<typeof DecisionSignalSchema>;

// ---------------------------------------------------------------------------
// Decision Signal Outcome
// ---------------------------------------------------------------------------

export const DecisionSignalOutcomeSchema = z.object({
  id: z.string().uuid(),
  signalId: z.string().uuid(),
  horizon: z.string(),
  evalStatus: EvalStatusSchema,
  unableReason: z.string().nullable(),
  outcome: OutcomeSchema.nullable(),
  directionCorrect: z.boolean().nullable(),
  priceReturnPct: z.number().nullable(),
  hitStopLoss: z.boolean().nullable(),
  hitTakeProfit: z.boolean().nullable(),
  firstHit: FirstHitSchema.nullable(),
  firstHitDays: z.number().int().nullable(),
  endPrice: z.number().nullable(),
  evaluatedAt: z.number().int(),
  engineVersion: z.string(),
});
export type DecisionSignalOutcome = z.infer<typeof DecisionSignalOutcomeSchema>;

// ---------------------------------------------------------------------------
// Signal Stats
// ---------------------------------------------------------------------------

export const ModelBreakdownSchema = z.object({
  model: z.string(),
  hitRate: z.number().min(0).max(1),
  count: z.number().int(),
});
export type ModelBreakdown = z.infer<typeof ModelBreakdownSchema>;

export const HorizonBreakdownSchema = z.object({
  horizon: z.string(),
  hitRate: z.number().min(0).max(1),
  count: z.number().int(),
});
export type HorizonBreakdown = z.infer<typeof HorizonBreakdownSchema>;

export const ActionBreakdownSchema = z.object({
  action: z.string(),
  hitRate: z.number().min(0).max(1),
  count: z.number().int(),
});
export type ActionBreakdown = z.infer<typeof ActionBreakdownSchema>;

export const SignalStatsSchema = z.object({
  total: z.number().int(),
  evaluated: z.number().int(),
  hitRate: z.number().min(0).max(1),
  avgReturnPct: z.number(),
  byModel: z.array(ModelBreakdownSchema),
  byHorizon: z.array(HorizonBreakdownSchema),
  byAction: z.array(ActionBreakdownSchema),
  recentSignals: z.array(DecisionSignalSchema),
});
export type SignalStats = z.infer<typeof SignalStatsSchema>;

// ---------------------------------------------------------------------------
// Evaluation config (used by the backtest engine)
// ---------------------------------------------------------------------------

export const EvaluationConfigSchema = z.object({
  evalWindowDays: z.number().int().min(1).max(30).default(10),
  neutralBandPct: z.number().min(0).max(10).default(1.0),
  engineVersion: z.string().default('v1'),
});
export type EvaluationConfig = z.infer<typeof EvaluationConfigSchema>;

export const DEFAULT_EVAL_CONFIG: EvaluationConfig = {
  evalWindowDays: 10,
  neutralBandPct: 1.0,
  engineVersion: 'v1',
};