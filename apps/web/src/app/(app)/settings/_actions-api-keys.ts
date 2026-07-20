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

// API keys domain actions: BYOK key management, export/import, market data provider selection.

import { auth } from '@/auth';
import { schema, withRateLimit } from '@hamafx/db'
import { getDb } from '@hamafx/ai';
import { eq, and } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { verifySync } from 'otplib';
import { testProviderKey } from '@hamafx/ai';
import {
  PROVIDER_IDS,
  encryptByok,
  decryptByok,
  decryptSecret,
  encryptWithPassword,
  decryptWithPassword,
  type ByokPayload,
} from '@hamafx/shared/encryption';
import { type ActionResult, type SaveKeysResult, verifyAccountPassword } from './_actions-shared';

/**
 * Server action to save/update/clear API keys for all BYOK providers.
 * Tests changed keys and stores health results.
 */
export async function updateApiKeysAction(
  _prevState: SaveKeysResult,
  formData: FormData,
): Promise<SaveKeysResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Not authenticated' };
  }

  const keys: ByokPayload = {};
  let clearedCount = 0;
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(id);
    if (typeof raw === 'string' && raw.trim().length > 0) {
      keys[id] = raw.trim();
    } else {
      clearedCount += 1;
    }
  }

  try {
    const db = getDb();
    const [oldSettings] = await db.select({
      aiApiKeys: schema.userSettings.aiApiKeys,
      aiApiKeysUpdatedAt: schema.userSettings.aiApiKeysUpdatedAt,
    })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, session.user.id));
    const oldDecrypted = oldSettings?.aiApiKeys ? decryptByok(oldSettings.aiApiKeys) : null;
    const oldUpdatedAt = oldSettings?.aiApiKeysUpdatedAt ?? {};

    const newUpdatedAt = { ...oldUpdatedAt };
    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];
      if (newKey && newKey !== oldKey) {
        newUpdatedAt[id] = new Date().toISOString();
      } else if (!newKey && oldKey) {
        delete newUpdatedAt[id];
      }
    }

    // STAB-10: Run all network calls (testProviderKey) BEFORE opening a
    // DB transaction so we don't hold a connection open during I/O.
    const testedAt = new Date();
    const testResults: Array<{
      id: string;
      action: 'upsert' | 'delete';
      ok?: boolean;
      error?: string;
    }> = [];

    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];

      if (newKey && newKey !== oldKey) {
        const result = await testProviderKey(id, newKey);
        if (result.ok) {
          testResults.push({ id, action: 'upsert', ok: true });
        } else {
          testResults.push({ id, action: 'upsert', ok: false, error: result.error ?? 'unknown error' });
        }
      } else if (!newKey && oldKey) {
        testResults.push({ id, action: 'delete' });
      }
    }

    // STAB-10: Atomic write — all DB mutations inside one transaction.
    const userId = session.user.id;
    await db.transaction(async (tx) => {
      await tx.update(schema.userSettings)
        .set({
          aiApiKeys: Object.keys(keys).length > 0 ? encryptByok(keys) : null,
          aiApiKeysUpdatedAt: Object.keys(newUpdatedAt).length > 0 ? newUpdatedAt : null,
        })
        .where(eq(schema.userSettings.userId, userId));

      for (const tr of testResults) {
        await tx
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, userId),
              eq(schema.providerTests.providerId, tr.id),
            ),
          );
        if (tr.action === 'upsert') {
          await tx.insert(schema.providerTests).values({
            userId,
            providerId: tr.id,
            ok: tr.ok!,
            error: tr.ok ? null : (tr.error ?? 'unknown error'),
            testedAt: testedAt.toISOString(),
          });
        }
      }
    });

    revalidatePath('/settings/api-keys');
    return {
      ok: true as const,
      data: {
        savedCount: Object.keys(keys).length,
        clearedCount,
        at: Date.now(),
      },
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Server action to export user API keys.
 * Encrypts the user's saved BYOK payload with a password.
 */
export async function exportKeysAction(password: string, totpCode?: string): Promise<ActionResult<{ payload: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!password || password.length < 8) {
    return { ok: false as const, error: 'Password must be at least 8 characters' };
  }

  // Check 2FA if enabled
  const db = getDb();
  const [user] = await db.select({
    twoFactorEnabled: schema.users.twoFactorEnabled,
    twoFactorSecret: schema.users.twoFactorSecret,
  }).from(schema.users).where(eq(schema.users.id, session.user.id));

  if (user?.twoFactorEnabled) {
    if (!totpCode) {
      return { ok: false as const, error: '2FA code is required' };
    }
    const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!decryptedSecret || !verifySync({ secret: decryptedSecret, token: totpCode }).valid) {
      return { ok: false as const, error: 'Invalid 2FA code' };
    }
  }

  // Verify password against account credentials
  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_export_keys', 3);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    const [settings] = await db.select({ aiApiKeys: schema.userSettings.aiApiKeys })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, session.user.id));

    const encryptedPayload = settings?.aiApiKeys;
    if (!encryptedPayload) {
      return { ok: false as const, error: 'No keys configured to export' };
    }

    const decrypted = decryptByok(encryptedPayload);
    if (!decrypted || Object.keys(decrypted).length === 0) {
      return { ok: false as const, error: 'No keys configured to export' };
    }

    // Encrypt with the user password
    const backupPayload = encryptWithPassword(decrypted, password);

    return { ok: true as const, data: { payload: backupPayload } };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to import user API keys.
 * Decrypts the backup payload with a password and saves to user settings.
 */
export async function importKeysAction(payload: string, password: string): Promise<ActionResult<{ importedCount: number }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!payload || !password) {
    return { ok: false as const, error: 'Payload and password are required' };
  }

  // Verify password against account credentials
  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_import_keys', 5);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const decryptedKeys = decryptWithPassword(payload, password) as Record<string, unknown>;
    if (!decryptedKeys || typeof decryptedKeys !== 'object') {
      return { ok: false as const, error: 'Invalid backup payload or incorrect password' };
    }

    const validKeys: Record<string, string> = {};
    for (const id of PROVIDER_IDS) {
      const val = decryptedKeys[id];
      if (typeof val === 'string' && val.trim().length > 0) {
        validKeys[id] = val.trim();
      }
    }

    if (Object.keys(validKeys).length === 0) {
      return { ok: false as const, error: 'No valid keys found in backup payload' };
    }

    const db = getDb();

    const now = new Date().toISOString();
    const newUpdatedAt: Record<string, string> = {};
    for (const id of Object.keys(validKeys)) {
      newUpdatedAt[id] = now;
    }

    await db.update(schema.userSettings)
      .set({
        aiApiKeys: encryptByok(validKeys),
        aiApiKeysUpdatedAt: newUpdatedAt,
      })
      .where(eq(schema.userSettings.userId, session.user.id));

    revalidatePath('/settings/api-keys');
    return { ok: true as const, data: { importedCount: Object.keys(validKeys).length } };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update the selected market data provider.
 */
export async function updateMarketDataProviderAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_provider', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const provider = formData.get('marketDataProvider') as string;
  if (!provider || !['biquote', 'finnhub', 'live-ticks'].includes(provider)) {
    return { ok: false as const, error: 'Invalid provider selected' };
  }

  try {
    const db = getDb();
    await db.update(schema.userSettings)
      .set({
        marketDataProvider: provider,
      })
      .where(eq(schema.userSettings.userId, session.user.id));

    revalidatePath('/settings/api-keys');
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
