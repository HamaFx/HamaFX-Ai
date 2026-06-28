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

// F7 — Bot Platform with Commands
//
// Maps a Telegram chat ID (or other platform chat ID) to a HamaFX user.
// This allows the bot dispatcher to resolve incoming messages to an
// authenticated user for per-user data access and rate limiting.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F7 for the full design.

import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const botLinks = pgTable(
  'bot_links',
  {
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'telegram' | 'discord' | 'slack' — extensible. */
    platform: text('platform').notNull(),
    /** The chat ID from the bot platform (Telegram chat ID, etc.). */
    chatId: text('chat_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.platform, t.chatId] }),
    index('bot_links_user_idx').on(t.userId, t.platform),
  ],
);

export type BotLinkRow = typeof botLinks.$inferSelect;
export type BotLinkInsert = typeof botLinks.$inferInsert;
