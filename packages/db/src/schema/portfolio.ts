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

// F2 — Portfolio Management
//
// Two tables:
//   1. portfolio_positions  — forex/XAU positions with lot sizes, entry/stop/target
//   2. portfolio_settings   — per-user account balance and risk limits
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F2 for the full design.

import { doublePrecision, index, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { decisionSignals } from './decision-signals';

// ---------------------------------------------------------------------------
// portfolio_positions
// ---------------------------------------------------------------------------

export const portfolioPositions = pgTable(
  'portfolio_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    /** "XAUUSD" | "EURUSD" | "GBPUSD" — kept as text. */
    symbol: text('symbol').notNull(),
    /** "long" | "short". */
    direction: text('direction').notNull(),
    /** In standard lots (1.0 = 100k units for FX, 100 oz for gold). */
    lotSize: doublePrecision('lot_size').notNull(),
    entryPrice: doublePrecision('entry_price').notNull(),
    stopLoss: doublePrecision('stop_loss'),
    takeProfit: doublePrecision('take_profit'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closePrice: doublePrecision('close_price'),
    /** "open" | "closed". */
    status: text('status').notNull().default('open'),
    notes: text('notes'),
    /** Optional link to a decision signal that generated this position. */
    linkedSignalId: uuid('linked_signal_id').references(() => decisionSignals.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('portfolio_positions_user_status_idx').on(t.userId, t.status),
    index('portfolio_positions_symbol_idx').on(t.symbol, t.status),
  ],
);

// ---------------------------------------------------------------------------
// portfolio_settings
// ---------------------------------------------------------------------------

export const portfolioSettings = pgTable(
  'portfolio_settings',
  {
    /** Phase A — multi-user. One row per user. */
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    /** For risk % calculations. */
    accountBalance: doublePrecision('account_balance'),
    /** Default "USD". */
    baseCurrency: text('base_currency').notNull().default('USD'),
    /** Max risk per trade as % of account. */
    maxRiskPerTradePct: real('max_risk_per_trade_pct').notNull().default(2.0),
    /** Max total exposure as % of account. */
    maxTotalExposurePct: real('max_total_exposure_pct').notNull().default(10.0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('portfolio_settings_user_idx').on(t.userId)],
);