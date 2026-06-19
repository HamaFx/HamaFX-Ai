// Phase B — per-user rate limits.
//
// Plan §4: shift from in-memory IP-based rate limiting to a
// Postgres-backed sliding window that survives distributed deployments.
//
// Schema lives alongside the other user-scoped tables. The window is
// fixed at 1 minute (the only cadence that fits a single PK row); for
// longer windows we'd need a separate aggregator.
//
// Wire format:
//   INSERT INTO rate_limits (user_id, endpoint_group, window_start, request_count)
//   VALUES (:uid, :group, date_trunc('minute', now()), 1)
//   ON CONFLICT (user_id, endpoint_group, window_start) DO UPDATE
//     SET request_count = rate_limits.request_count + 1
//   RETURNING request_count;

import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Rate-limit counters per (user, endpoint_group, 1-minute window).
 *
 * `endpoint_group` is a coarse label like `ai_chat` or `auth_login`.
 * Window is minute-aligned via `date_trunc('minute', now())` so the PK
 * auto-rolls over without a sweeper.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpointGroup: text('endpoint_group').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.endpointGroup, t.windowStart] }),
    index('rate_limits_user_idx').on(t.userId),
  ],
);

export type RateLimitRow = typeof rateLimits.$inferSelect;
export type RateLimitInsert = typeof rateLimits.$inferInsert;