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

import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/**
 * One-off shareable analysis snapshots. Reachable via `/share/<id>?t=<token>`
 * where `token` is an HMAC of `{id, expiresAt}` signed with `AUTH_COOKIE_SECRET`.
 *
 * The route is bypassed by the password gate but verified by token, so the
 * single user can paste a link into Telegram without giving away the password.
 */
export const sharedSnapshots = pgTable(
  'shared_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    title: text('title').notNull(),
    /** Plain-text body, rendered as Markdown in the share UI. */
    body: text('body').notNull(),
    /** Optional `AnnotateChartOutput` shape — overlay re-rendered on the
     *  share page when present. */
    overlay: jsonb('overlay'),
    /** Symbol / timeframe pair used to fetch candles when rendering the overlay. */
    symbol: text('symbol'),
    tf: text('tf'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('shared_snapshots_user_id_idx').on(t.userId), index('shared_snapshots_expires_at_idx').on(t.expiresAt)],
);