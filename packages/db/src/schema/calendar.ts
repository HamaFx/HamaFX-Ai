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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('events_date_idx').on(t.date),
    index('events_importance_idx').on(t.importance),
    index('events_currency_idx').on(t.currency),
  ],
);
