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

// F4 — Notification Noise Control
//
// Persisted dedup/cooldown state for notification noise filtering.
// In a multi-instance deployment (Vercel/Docker), this table replaces
// in-memory state so all instances share the same dedup/cooldown view.
//
// See DSA_FEATURE_EXPANSION_PLAN.md §F4 for the full design.

import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { organization, users } from './auth';

export const notificationNoiseState = pgTable(
  'notification_noise_state',
  {
    /** Phase A — multi-user. References the NextAuth users table. */
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    /** Hashed content + route type for dedup. */
    dedupKey: text('dedup_key').notNull(),
    tenantId: text('tenant_id')
      .notNull()
      .default(sql`current_setting('app.current_tenant', true)`)
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** "report" | "alert" | "system_error" | "signal_outcome" | "briefing" | "usage_warning". */
    routeType: text('route_type').notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull(),
    /** When this entry expires and can be purged. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('notification_noise_state_user_dedup_idx').on(t.userId, t.dedupKey),
    index('notification_noise_state_expires_idx').on(t.expiresAt),
  ],
);
