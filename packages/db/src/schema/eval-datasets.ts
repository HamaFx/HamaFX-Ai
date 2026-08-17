/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

export type EvalDatasetStatus = 'draft' | 'in_review' | 'approved' | 'archived';

/** Registry entry for an immutable, content-addressed evaluation dataset. */
export const evalDatasets = pgTable(
  'eval_datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: text('version').notNull(),
    status: text('status').$type<EvalDatasetStatus>().notNull().default('draft'),
    recordCount: integer('record_count').notNull().default(0),
    contentSha256: text('content_sha256').notNull(),
    source: text('source').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull(),
    createdBy: text('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: text('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('eval_datasets_version_uk').on(table.version),
    uniqueIndex('eval_datasets_content_hash_uk').on(table.contentSha256),
  ],
);

export type EvalDatasetRow = typeof evalDatasets.$inferSelect;
export type EvalDatasetInsert = typeof evalDatasets.$inferInsert;
