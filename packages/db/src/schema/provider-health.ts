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

// H1 (RELIABILITY_AUDIT_REPORT.md) — Shared provider health store.
//
// The in-memory health scoring (packages/data/src/health.ts) tracks
// per-provider success/failure rates within a 5-minute window to
// influence failover ordering. On Vercel, each function instance has
// its own copy, causing routing divergence: instance A demotes a
// degraded provider while instance B still tries it.
//
// This table provides a lightweight cross-instance health snapshot.
// Each row records the most recent failure state per provider. The
// health scorer merges DB state with in-memory state to produce the
// worst-case score across all instances.
//
// Writes are fire-and-forget (no caller blocks on provider health).
// Rows are self-cleaning: entries older than 5 minutes are ignored
// by the scorer, and a periodic retention job prunes them.

import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const providerHealth = pgTable('provider_health', {
  /** Provider name (e.g. 'biquote-rest', 'finnhub', 'live-ticks'). */
  provider: text('provider').primaryKey(),
  /** Most recent successful call to this provider. */
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  /** Most recent failed call to this provider. */
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  /** Number of consecutive failures across all instances. */
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  /** Last time this row was updated. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
