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

import { sql } from 'drizzle-orm';
import { doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    /** "XAUUSD" | "EURUSD" | "GBPUSD". */
    symbol: text('symbol').notNull(),
    /** "long" | "short". */
    side: text('side').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    entry: doublePrecision('entry').notNull(),
    stop: doublePrecision('stop'),
    target: doublePrecision('target'),
    exit: doublePrecision('exit'),
    /** Position size in lots (nullable — many users journal without sizing). */
    size: doublePrecision('size'),
    /** "win" | "loss" | "breakeven" | "open". */
    outcome: text('outcome').notNull().default('open'),
    rMultiple: doublePrecision('r_multiple'),
    notes: text('notes'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Storage paths; use Supabase Storage if/when we wire it. */
    attachments: text('attachments')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('journal_entries_user_id_idx').on(t.userId), index('journal_symbol_idx').on(t.symbol), index('journal_opened_idx').on(t.openedAt)],
);