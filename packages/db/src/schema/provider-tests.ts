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

import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './auth';

/**
 * Latest test result per (userId, providerId) — populated by the
 * Test Connection button on /settings/api-keys and read by the
 * health badge in the ApiKeyCard.
 *
 * Phase A — UX_UPGRADE_PLAN.md item 7.
 *
 * We store ONE row per (user, provider) using a composite primary
 * key so the upsert in /api/settings/test-provider is idempotent:
 * pressing "Test" twice in a row just overwrites the previous
 * row with the newer result. We do not accumulate history here —
 * if we ever want history, that is a separate table.
 *
 * ON DELETE CASCADE on user_id: when a user account is removed
 * (an admin operation), all their test results go with it.
 */
export const providerTests = pgTable(
  'provider_tests',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    ok: boolean('ok').notNull(),
    /** Human-readable error message — null when ok. Never logged. */
    error: text('error'),
    testedAt: timestamp('tested_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: index('provider_tests_user_provider_idx').on(t.userId, t.providerId),
  }),
);
