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

// Phase 3 §3.11 — fetch active user IDs for cron jobs and background
// processing. Replaces the hardcoded `['__system__']` fallback pattern.
//
// A user is "active" if:
//   - `deletedAt IS NULL` (not soft-deleted)
//   - They have at least one chat thread (they've used the app at least once)
//
// The second condition prevents briefing/review jobs from running for
// users who signed up but never interacted. For self-host (legacy mode)
// where only `__system__` exists, the query returns that single row.

import { eq, isNull } from 'drizzle-orm';

import { getDb, schema } from './index';

/**
 * Fetch all active user IDs from the database.
 *
 * In legacy / self-host mode where only the `__system__` user exists,
 * this returns `['__system__']`.
 *
 * In multi-tenant mode, this returns every non-deleted user who has
 * at least one chat thread.
 */
export async function getActiveUserIds(): Promise<string[]> {
  const db = getDb();

  // Query users that are not soft-deleted and have at least one chat thread.
  // Uses INNER JOIN instead of correlated EXISTS subquery for better
  // performance — Postgres can use a hash join rather than executing
  // the subquery once per user row.
  const rows = await db
    .selectDistinct({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.chatThreads, eq(schema.chatThreads.userId, schema.users.id))
    .where(isNull(schema.users.deletedAt));

  const userIds = rows.map((r) => r.id);

  // Fallback: if no users with chat threads are found (e.g. fresh install,
  // legacy mode with only __system__ and no threads yet), return __system__
  // if it exists. This preserves self-host compatibility.
  if (userIds.length === 0) {
    const systemUser = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, '__system__'))
      .limit(1);

    if (systemUser.length > 0) {
      return ['__system__'];
    }
  }

  return userIds;
}
