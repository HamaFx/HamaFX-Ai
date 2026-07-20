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

// Shared query helpers for fetching user settings + user row in one call.
// Duplicated across agent.ts, chat/route.ts, cost.ts, and usage-alerts.ts
// — extracted here to keep field selection consistent and reduce drift.

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

export interface UserWithSettings {
  settings: typeof schema.userSettings.$inferSelect | null;
  user: {
    name: string | null;
    email: string | null;
  } | null;
}

/**
 * Fetch userSettings + basic user info (name, email) in parallel.
 * Returns null settings when no row exists (caller should handle).
 */
export async function getUserWithSettings(
  userId: string,
): Promise<UserWithSettings> {
  const db = getDb();
  const [settings, userRow] = await Promise.all([
    db
      .select()
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId))
      .then((rows) => rows[0] ?? null),
    db
      .select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .then((rows) => rows[0] ?? null),
  ]);

  return { settings, user: userRow };
}

/**
 * List all user settings rows. Used by background job that checks
 * spending alerts across every user.
 */
export async function listAllUserSettings(): Promise<typeof schema.userSettings.$inferSelect[]> {
  const db = getDb();
  return db.select().from(schema.userSettings);
}

/**
 * Update a single field on the userSettings row for a given userId.
 * Uses a partial update so only the provided field is changed.
 */
export async function updateUserSettingsField<K extends keyof typeof schema.userSettings.$inferInsert>(
  userId: string,
  field: K,
  value: (typeof schema.userSettings.$inferInsert)[K],
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.userSettings)
    .set({ [field]: value } as Partial<typeof schema.userSettings.$inferInsert>)
    .where(eq(schema.userSettings.userId, userId));
}
