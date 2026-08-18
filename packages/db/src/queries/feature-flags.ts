/**
 * Copyright 2026 Kestrel
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

// Feature flag query helpers.

import { eq } from 'drizzle-orm';

import { getDb, schema } from '../client';

export type FeatureFlagRow = typeof schema.featureFlags.$inferSelect;

export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const db = getDb();
  return db.select().from(schema.featureFlags);
}

/** Return false for an unknown flag so new rollout gates fail closed. */
export async function getFeatureFlag(key: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ enabled: schema.featureFlags.enabled })
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.key, key))
    .limit(1);
  return rows[0]?.enabled === true;
}

export async function upsertFeatureFlag(
  key: string,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.featureFlags)
    .values({ key, enabled, updatedBy })
    .onConflictDoUpdate({
      target: schema.featureFlags.key,
      set: { enabled, updatedAt: new Date(), updatedBy },
    });
}
