import { sql } from 'drizzle-orm';
import { doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** "XAUUSD" | "EURUSD" | "GBPUSD". */
    symbol: text('symbol').notNull(),
    /** "long" | "short". */
    side: text('side').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    entry: doublePrecision('entry').notNull(),
    stop: doublePrecision('stop'),
    target: doublePrecision('target'),
    exit: doublePrecision('exit'),
    /** Position size in lots (nullable — many users journal without sizing). */
    size: doublePrecision('size'),
    /** "win" | "loss" | "breakeven" | "open". */
    outcome: text('outcome').notNull().default('open'),
    rMultiple: doublePrecision('r_multiple'),
    notes: text('notes'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Storage paths; use Supabase Storage if/when we wire it. */
    attachments: text('attachments')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('journal_symbol_idx').on(t.symbol), index('journal_opened_idx').on(t.openedAt)],
);
