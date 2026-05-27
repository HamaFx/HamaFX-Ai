import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  (t) => [index('shared_snapshots_expires_at_idx').on(t.expiresAt)],
);
