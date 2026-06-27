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

// F1 — Shared types for the decision-signals subsystem.
// Re-exported from @hamafx/shared so all packages use the same contract.

import type {
  DecisionAction,
  DecisionBias,
  SignalHorizon,
  SignalSourceType,
} from '@hamafx/shared';

export type {
  DecisionAction,
  DecisionBias,
  SignalHorizon,
  SignalSourceType,
  SignalStatus,
  EvalStatus,
  Outcome,
  FirstHit,
  Feedback,
  EvalHorizon,
  DecisionSignal,
  DecisionSignalOutcome,
  SignalStats,
  ModelBreakdown,
  HorizonBreakdown,
  ActionBreakdown,
  EvaluationConfig,
} from '@hamafx/shared';

export {
  DecisionActionSchema,
  DecisionBiasSchema,
  SignalHorizonSchema,
  SignalSourceTypeSchema,
  SignalStatusSchema,
  EvalStatusSchema,
  OutcomeSchema,
  FirstHitSchema,
  FeedbackSchema,
  EVAL_HORIZONS,
  HORIZON_DAYS,
  DEFAULT_EVAL_CONFIG,
} from '@hamafx/shared';

// ---------------------------------------------------------------------------
// Payload — what the extractor produces and persistence consumes.
// ---------------------------------------------------------------------------

export interface DecisionSignalPayload {
  symbol: string;
  action: DecisionAction;
  bias: DecisionBias;
  confidence: number | null;
  entryLow: number | null;
  entryHigh: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  horizon: SignalHorizon;
  anchorPrice: number;
  sourceType: SignalSourceType;
  model: string | null;
  analysisMode: string | null;
  metadata: Record<string, unknown>;
  userId: string;
  threadId: string;
  messageId: string;
}

// ---------------------------------------------------------------------------
// Backtest engine types
// ---------------------------------------------------------------------------

export interface DailyBar {
  date: string;
  high: number;
  low: number;
  close: number;
}

export interface OutcomeResult {
  outcome: 'hit' | 'miss' | 'neutral';
  directionCorrect: boolean;
  priceReturnPct: number;
  hitStopLoss: boolean;
  hitTakeProfit: boolean;
  firstHit: 'stop' | 'target' | 'neither';
  firstHitDays: number | null;
  endPrice: number;
}

export interface UnableResult {
  evalStatus: 'unable';
  reason: string;
}

export type EngineEvaluationResult = OutcomeResult | UnableResult;

export interface SignalForEvaluation {
  id: string;
  bias: DecisionBias;
  anchorPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  anchorAt: number; // epoch ms
  symbol: string;
}