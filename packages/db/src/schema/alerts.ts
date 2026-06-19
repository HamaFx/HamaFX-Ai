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

import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Alerts. The `rule` column holds the discriminated-union AlertRule schema
 * (see @hamafx/shared/schemas/alerts) as JSONB so we can evolve rule shapes
 * without migrations.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    /** zod-validated AlertRule JSON — see packages/shared/src/schemas/alerts.ts */
    rule: jsonb('rule').notNull(),
    /** AlertChannel[] persisted as text[]. */
    channels: text('channels').array().notNull().default(['email']),
    note: text('note'),
    active: boolean('active').notNull().default(true),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('alerts_user_id_idx').on(t.userId), index('alerts_active_idx').on(t.active), index('alerts_fired_at_idx').on(t.firedAt)],
);