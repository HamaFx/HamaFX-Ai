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

import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './auth';

/**
 * Audit trail for privileged admin actions.
 *
 * Separate from the general `audit_logs` table (which is tenant-scoped and
 * used for tenant-level audit). This table is intended for the operator
 * console and records actions such as role changes, onboarding resets,
 * feature-flag toggles, and impersonation.
 */
export const adminAuditLogs = pgTable(
  'admin_audit_log',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    targetUserId: text('target_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('admin_audit_log_actor_user_id_idx').on(t.actorUserId),
    index('admin_audit_log_target_user_id_idx').on(t.targetUserId),
    index('admin_audit_log_action_idx').on(t.action),
    index('admin_audit_log_created_at_idx').on(t.createdAt),
  ],
);

export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
export type AdminAuditLogInsert = typeof adminAuditLogs.$inferInsert;
