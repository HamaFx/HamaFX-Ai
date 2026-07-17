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

// Telegram webhook idempotency table.
//
// Telegram retries undelivered updates up to ~100 times over 24h.
// In multi-instance Vercel deployments, a retried update_id can land
// on a different instance and bypass in-memory dedup. This table
// provides atomic INSERT...ON CONFLICT DO NOTHING dedup.
//
// Rows older than 1 hour are safe to delete (Telegram retries within
// minutes). The cron retention job (DB-1) handles cleanup.

import { index, pgTable, bigint, timestamp } from 'drizzle-orm/pg-core';

export const telegramUpdates = pgTable(
  'telegram_updates',
  {
    updateId: bigint('update_id', { mode: 'number' }).primaryKey(),
    processedAt: timestamp('processed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index('telegram_updates_processed_at_idx').on(t.processedAt),
  ],
);
