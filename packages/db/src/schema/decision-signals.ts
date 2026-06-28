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
//
// Three tables:
//   1. decision_signals        — every AI directional recommendation
//   2. decision_signal_outcomes — forward evaluation results per horizon
//   3. decision_signal_feedback — user thumbs-up/down on a signal
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F1 for the full design.

import { boolean, doublePrecision, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { chatThreads } from './chat';
import { chatMessages } from './chat';

// ---------------------------------------------------------------------------
// decision_signals
// ---------------------------------------------------------------------------

export const decisionSignals = pgTable(
  'decision_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    threadId: uuid('thread_id').references(() => chatThreads.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => chatMessages.id, { onDelete: 'set null' }),
    /** "XAUUSD" | "EURUSD" | "GBPUSD" — kept as text. */
    symbol: text('symbol').notNull(),
    /** "buy" | "sell" | "hold" | "reduce" | "add" | "avoid". */
    action: text('action').notNull(),
    /** "bullish" | "bearish" | "neutral". */
    bias: text('bias').notNull(),
    /** 0.0–1.0 — nullable because not all models emit confidence. */
    confidence: real('confidence'),
    /** Entry zone low. */
    entryLow: doublePrecision('entry_low'),
    /** Entry zone high. */
    entryHigh: doublePrecision('entry_high'),
    stopLoss: doublePrecision('stop_loss'),
    takeProfit: doublePrecision('take_profit'),
    /** "intraday" | "1d" | "3d" | "5d" | "10d" | "swing". */
    horizon: text('horizon').notNull(),
    /** Price at signal creation — the anchor for outcome evaluation. */
    anchorPrice: doublePrecision('anchor_price').notNull(),
    /** Time of signal creation. */
    anchorAt: timestamp('anchor_at', { withTimezone: true }).notNull(),
    /** "chat" | "alert" | "briefing" | "manual". */
    sourceType: text('source_type').notNull(),
    /** Which model produced this signal, e.g. "anthropic/claude-3.7-sonnet". */
    model: text('model'),
    /** "single" | "quick" | "standard" | "full" (links to multi-agent). */
    analysisMode: text('analysis_mode'),
    /** "active" | "expired" | "invalidated" | "closed". */
    status: text('status').notNull().default('active'),
    /** Reasoning, market phase, etc. */
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('decision_signals_user_idx').on(t.userId, t.createdAt),
    index('decision_signals_symbol_idx').on(t.symbol, t.status),
    index('decision_signals_active_idx').on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// decision_signal_outcomes
// ---------------------------------------------------------------------------

export const decisionSignalOutcomes = pgTable(
  'decision_signal_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id')
      .references(() => decisionSignals.id, { onDelete: 'cascade' })
      .notNull(),
    /** "1d" | "3d" | "5d" | "10d". */
    horizon: text('horizon').notNull(),
    /** "completed" | "unable". */
    evalStatus: text('eval_status').notNull(),
    /** "insufficient_forward_bars" | "missing_anchor_price" | ... */
    unableReason: text('unable_reason'),
    /** "hit" | "miss" | "neutral". */
    outcome: text('outcome'),
    directionCorrect: boolean('direction_correct'),
    /** Actual price move %. */
    priceReturnPct: real('price_return_pct'),
    hitStopLoss: boolean('hit_stop_loss'),
    hitTakeProfit: boolean('hit_take_profit'),
    /** "stop" | "target" | "neither". */
    firstHit: text('first_hit'),
    firstHitDays: integer('first_hit_days'),
    endPrice: doublePrecision('end_price'),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
    /** Engine version for forward-compat. */
    engineVersion: text('engine_version').notNull().default('v1'),
  },
  (t) => [
    uniqueIndex('decision_signal_outcomes_signal_horizon_idx').on(t.signalId, t.horizon),
    index('decision_signal_outcomes_signal_idx').on(t.signalId),
    // Phase 3 §18 — index for time-range queries (e.g. "outcomes in last 24h")
    index('decision_signal_outcomes_evaluated_idx').on(t.evaluatedAt),
  ],
);

// ---------------------------------------------------------------------------
// decision_signal_feedback
// ---------------------------------------------------------------------------

export const decisionSignalFeedback = pgTable(
  'decision_signal_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    signalId: uuid('signal_id')
      .references(() => decisionSignals.id, { onDelete: 'cascade' })
      .notNull(),
    /** Phase A — multi-user. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    /** "useful" | "not_useful". */
    feedback: text('feedback').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('decision_signal_feedback_signal_user_idx').on(t.signalId, t.userId)],
);
