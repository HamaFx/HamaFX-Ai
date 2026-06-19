'use server';

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

import 'server-only';

import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { ByokPayload } from '@hamafx/shared/encryption';
import { encryptByok, decryptByok } from '@hamafx/shared/encryption';
import type { PROVIDER_IDS } from '@hamafx/shared/byok';

export interface OnboardingPayload {
  displayName?: string;
  timezone?: string;
  defaultSymbol?: string;
  /** Map of provider id → plaintext API key. Empty string = don't change. */
  apiKeys?: Partial<Record<(typeof PROVIDER_IDS)[number], string>>;
}

/**
 * Complete onboarding for the current user. Accepts an arbitrary payload
 * so each step of the wizard can re-submit incrementally (so an early
 * step can save partial state if the user navigates away).
 */
export async function completeOnboardingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  const userId = session.user.id;

  const payload: OnboardingPayload = JSON.parse(
    (formData.get('payload') as string) || '{}',
  );

  const db = getDb();
  await db.transaction(async (tx) => {
    // 1. Merge API keys — keep existing ones for providers not in the payload.
    const [existing] = await tx
      .select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));
    const currentKeys = decryptByok(existing?.aiApiKeys) ?? {};
    const merged: ByokPayload = { ...currentKeys };
    if (payload.apiKeys) {
      for (const [id, raw] of Object.entries(payload.apiKeys)) {
        const value = (raw ?? '').trim();
        if (value.length > 0) {
          merged[id as keyof ByokPayload] = value;
        }
        // Empty string = leave existing key in place (no-op). Use a
        // dedicated "clear" flow if the user wants to remove a key.
      }
    }

    // 2. Upsert user settings.
    const encryptedKeys = encryptByok(merged);
    const existingSettings = await tx
      .select({ userId: schema.userSettings.userId })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, userId));

    if (existingSettings.length === 0) {
      await tx.insert(schema.userSettings).values({
        userId,
        defaultSymbol: payload.defaultSymbol || 'XAUUSD',
        timezone: payload.timezone || 'UTC',
        aiApiKeys: encryptedKeys,
        onboardingCompleted: true,
      });
    } else {
      await tx
        .update(schema.userSettings)
        .set({
          defaultSymbol: payload.defaultSymbol || 'XAUUSD',
          timezone: payload.timezone || 'UTC',
          aiApiKeys: encryptedKeys,
          onboardingCompleted: true,
        })
        .where(eq(schema.userSettings.userId, userId));
    }

    // 3. Add default watchlist.
    try {
      await tx
        .insert(schema.userSymbols)
        .values(
          ['XAUUSD', 'EURUSD', 'GBPUSD'].map((symbol, i) => ({
            userId,
            symbol,
            displayOrder: i,
          })),
        )
        .onConflictDoNothing();
    } catch {
      // ignore — symbols table may not exist in every schema version
    }
  });

  revalidatePath('/');
  return { success: true };
}