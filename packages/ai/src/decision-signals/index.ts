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

// F1 — Decision Signal Tracking + Outcome Evaluation.
// Barrel for the decision-signals subsystem.

// Types & shared schemas
export type {
  DecisionSignalPayload,
  DailyBar,
  OutcomeResult,
  UnableResult,
  EngineEvaluationResult,
  SignalForEvaluation,
} from './types';

// Extractor
export { extractDecisionSignal, type ExtractionContext } from './extractor';

// Backtest engine
export { evaluateSignal, candlesToDailyBars } from './backtest-engine';

// Persistence
export {
  createDecisionSignal,
  listSignals,
  getSignal,
  listSignalsNeedingEvaluation,
  recordOutcome,
  recordUnable,
  maybeCloseSignal,
  recordFeedback,
  computeSignalStats,
} from './persistence';

// Evaluation service
export { evaluatePendingSignals, type CronEvaluationResult } from './evaluation';