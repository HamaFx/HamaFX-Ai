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

// Onboarding query helpers — admin reset operations.

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

export type ResetMode = 'full' | 'soft';

/**
 * Reset a user's onboarding state.
 *
 * In `soft` mode: clears `onboardingCompleted` and `onboardingProgress`.
 * In `full` mode: additionally resets `defaultSymbol`, `timezone`,
 * `aiApiKeys`, and deletes all user symbols.
 *
 * Both modes run inside a single transaction.
 */
export async function resetOnboarding(
  userId: string,
  mode: ResetMode = 'soft',
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    const update: Partial<typeof schema.userSettings.$inferInsert> = {
      onboardingCompleted: false,
      onboardingProgress: null,
    };

    if (mode === 'full') {
      update.defaultSymbol = 'XAUUSD';
      update.timezone = 'UTC';
      update.aiApiKeys = null;
      await tx
        .delete(schema.userSymbols)
        .where(eq(schema.userSymbols.userId, userId));
    }

    await tx
      .update(schema.userSettings)
      .set(update)
      .where(eq(schema.userSettings.userId, userId));
  });
}
