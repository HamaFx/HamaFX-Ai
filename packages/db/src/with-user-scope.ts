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

// Phase B — query helpers for multi-tenant scoping.
//
// The plan documents called for `withUserScope(table, userId)` as a
// helper to DRY up the `.where(eq(table.userId, userId))` pattern that
// appears in every persistence function. We expose it as a tiny
// utility here so persistence code reads as:
//
//     const thread = await getDb().select().from(chatThreads).where(withUserScope(chatThreads, userId))
//
// instead of the noisier:
//
//     const thread = await getDb().select().from(chatThreads).where(eq(chatThreads.userId, userId))
//
// DESIGN DECISION (Phase 7 §34): The codebase currently uses `eq()`
// directly in most persistence files. Rather than force a mass
// refactor that risks breaking working queries, we keep this helper
// exported and available. New persistence code SHOULD use it; existing
// code may be migrated incrementally. The helper is tested and correct.

import { eq, type SQL } from 'drizzle-orm';

/**
 * Build a `WHERE` fragment that scopes a query to one user.
 *
 * Works for any Drizzle table that has a `userId` column. The full list
 * of user-scoped tables in the schema:
 *
 *   chatThreads, chatTelemetry, chatToolTelemetry, alerts,
 *   journalEntries, memoryEmbeddings, pushSubscriptions,
 *   sharedSnapshots, userSymbols, agentOpinions, portfolioPositions, portfolioSettings,
 *   notificationNoiseState, botLinks, providerTests, briefingsEmitted,
 *   dailyAiSpend, userSessions, rateLimits, auditLogs, userSettings.
 *
 * If a table has `userId`, this helper works for it — no need to
 * maintain an exhaustive list. The above is a reference, not a gate.
 *
 * @example
 *   await db.select().from(alerts).where(withUserScope(alerts, userId))
 */
export function withUserScope<T extends { userId: unknown }>(
  table: T,
  userId: string,
): SQL {
  // Cast: drizzle's column types are complex unions but `eq(table.userId, value)`
  // is the canonical usage in the codebase. We trust the caller to pass a
  // table with a userId column (TS won't catch a structural mismatch since
  // the generic above only checks the property name).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return eq((table as any).userId, userId);
}