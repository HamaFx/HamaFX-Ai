import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Alerts. The `rule` column holds the discriminated-union AlertRule schema
 * (see @hamafx/shared/schemas/alerts) as JSONB so we can evolve rule shapes
 * without migrations.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** zod-validated AlertRule JSON — see packages/shared/src/schemas/alerts.ts */
    rule: jsonb('rule').notNull(),
    /** AlertChannel[] persisted as text[]. */
    channels: text('channels')
      .array()
      .notNull()
      .default(['email']),
    note: text('note'),
    active: boolean('active').notNull().default(true),
    firedAt: timestamp('fired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('alerts_active_idx').on(t.active),
    index('alerts_fired_at_idx').on(t.firedAt),
  ],
);
