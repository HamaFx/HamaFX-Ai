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
import { doublePrecision, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Cached economic events. Populated by /api/cron/calendar.
 * `id` is provider-prefixed to avoid cross-source collisions, e.g.
 * "te:1234567" or "fred:CPIAUCSL:2024-05-15".
 */
export const economicEvents = pgTable(
  'economic_events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    /** Country/region code, e.g. "US", "EZ", "UK". */
    country: text('country').notNull(),
    /** "USD" | "EUR" | "GBP" | null */
    currency: text('currency'),
    /** "low" | "medium" | "high" */
    importance: text('importance').notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    actual: doublePrecision('actual'),
    forecast: doublePrecision('forecast'),
    previous: doublePrecision('previous'),
    unit: text('unit'),
    source: text('source').notNull(),
    /**
     * Set by /api/cron/fred-actuals when it patches `actual` for a row
     * that was previously null. Lets the backfill path stay idempotent
     * (only patch rows where this is null on the next run).
     */
    actualsFilledAt: timestamp('actuals_filled_at', { withTimezone: true }),
    tenantId: text('tenant_id').default(sql`'__system__'`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('events_date_idx').on(t.date),
    index('events_importance_idx').on(t.importance),
    index('events_currency_idx').on(t.currency),
  ],
);
