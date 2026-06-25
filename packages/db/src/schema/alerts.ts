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

import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Alerts. The `rule` column holds the discriminated-union AlertRule schema
 * (see @hamafx/shared/schemas/alerts) as JSONB so we can evolve rule shapes
 * without migrations.
 *
 * Phase C — UX_UPGRADE_PLAN.md item 17. Snooze support:
 *   - `snoozeHours` (int, 0..168): when an alert fires and snooze is
 *     set, the cron defers re-firing until lastFiredAt + interval.
 *   - `lastFiredAt` (timestamptz): the previous fire time used as
 *     the snooze baseline. NULL = never fired.
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
    /**
     * Phase C — item 17. When the alert fires, the cron writes the
     * current evaluation time here. Subsequent scans check
     * `lastFiredAt + snoozeHours interval` to decide whether to
     * re-fire. NULL = never fired, so the cron uses
     * `firedAt IS NULL` as the "ready to fire for the first time"
     * predicate.
     */
    lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
    /**
     * Phase C — item 17. Snooze in hours (0..168). 0 = no snooze
     * (one-shot, the legacy behavior). Any value > 0 means: after
     * firing, the alert goes dormant for that many hours before
     * becoming eligible to re-fire.
     */
    snoozeHours: integer('snooze_hours').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('alerts_user_id_idx').on(t.userId),
    index('alerts_active_idx').on(t.active),
    index('alerts_fired_at_idx').on(t.firedAt),
    index('alerts_last_fired_at_idx').on(t.lastFiredAt),
  ],
);