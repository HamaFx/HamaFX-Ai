import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Browser-issued web-push subscription. Single user, but the user can
 * subscribe from multiple devices, so this is keyed by `endpoint` (which
 * is unique per browser/device + service worker scope).
 *
 * `p256dh` and `auth` are the keys returned by `pushManager.subscribe`,
 * needed to encrypt the push payload per RFC 8030.
 */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  /** Captured at subscribe time so we know which device sent it. */
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
