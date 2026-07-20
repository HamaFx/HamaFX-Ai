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

// Provider health test query helpers.

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

/**
 * Get the latest health test results for all providers for a user.
 * Returns the Drizzle-inferred row type from the select query.
 */
export async function getProviderHealthForUser(userId: string) {
  const db = getDb();
  return db
    .select({
      providerId: schema.providerTests.providerId,
      ok: schema.providerTests.ok,
      error: schema.providerTests.error,
      testedAt: schema.providerTests.testedAt,
    })
    .from(schema.providerTests)
    .where(eq(schema.providerTests.userId, userId));
}

/**
 * Get the user's AI API keys (encrypted) from userSettings.
 * Returns null if no settings row exists. The column is text or jsonb.
 */
export async function getUserApiKeys(userId: string): Promise<string | null> {
  const db = getDb();
  const [settings] = await db
    .select({ aiApiKeys: schema.userSettings.aiApiKeys })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId));
  const val = settings?.aiApiKeys;
  return val != null ? String(val) : null;
}
