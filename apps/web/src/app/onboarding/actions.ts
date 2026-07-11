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

import { z } from 'zod';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { ByokPayload } from '@hamafx/shared/encryption';
import { encryptByok, decryptByok } from '@hamafx/shared/encryption';
import type { PROVIDER_IDS } from '@hamafx/shared/byok';
import { createScopedLoggerWithContext } from '@/lib/logger';

const symbolSchema = z.string().toUpperCase().regex(/^[A-Z0-9/]{1,10}$/);

export interface OnboardingPayload {
  displayName?: string;
  timezone?: string;
  defaultSymbol?: string;
  symbols?: string[];
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
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Not authenticated' };
  }
  const userId = session.user.id;

  let payload: OnboardingPayload;
  try {
    payload = JSON.parse((formData.get('payload') as string) || '{}');
  } catch {
    return { ok: false as const, error: 'Invalid preferences data' };
  }

  try {
    // Validate symbols
    if (payload.symbols && Array.isArray(payload.symbols)) {
      for (const sym of payload.symbols) {
        const parsed = symbolSchema.safeParse(sym);
        if (!parsed.success) {
          return { ok: false as const, error: `Invalid symbol: "${sym}"` };
        }
      }
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      // Save displayName to users table if provided
      if (payload.displayName && typeof payload.displayName === 'string') {
        await tx
          .update(schema.users)
          .set({ name: payload.displayName.trim().slice(0, 100) })
          .where(eq(schema.users.id, userId));
      }

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

      // 3. Add default or custom watchlist.
      try {
        const watchSymbols = payload.symbols && Array.isArray(payload.symbols) && payload.symbols.length > 0
          ? payload.symbols
          : ['XAUUSD', 'EURUSD', 'GBPUSD'];

        await tx.delete(schema.userSymbols).where(eq(schema.userSymbols.userId, userId));

        await tx
          .insert(schema.userSymbols)
          .values(
            watchSymbols.map((symbol, i) => ({
              userId,
              symbol,
              displayOrder: i,
            })),
          )
          .onConflictDoNothing();
      } catch (err) {
        createScopedLoggerWithContext({ component: 'onboarding', action: 'seed-watchlist' }).errorContext(
          err,
          'seedWatchlist',
          { userId },
        );
      }
    });

    revalidatePath('/');
    return { ok: true as const, success: true as const };
  } catch (err) {
    createScopedLoggerWithContext({ component: 'onboarding', action: 'complete-onboarding' }).errorContext(
      err,
      'completeOnboarding',
      { userId },
    );
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}