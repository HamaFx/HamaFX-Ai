import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const providerThrottle = pgTable('provider_throttle', {
  provider: text('provider').primaryKey(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'date' }).notNull(),
  count: integer('count').notNull().default(0),
  backoffUntil: timestamp('backoff_until', { withTimezone: true, mode: 'date' }),
});
