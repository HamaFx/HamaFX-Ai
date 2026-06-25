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

import bcrypt from 'bcryptjs';
import { deleteAllThreads, testProviderKey } from '@hamafx/ai';
import { auth } from '@/auth';
import { getDb, schema, withRateLimit } from '@hamafx/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import {
  PROVIDER_IDS,
  encryptByok,
  decryptByok,
  encryptWithPassword,
  decryptWithPassword,
  type ByokPayload,
} from '@hamafx/shared/encryption';

const NAME_MIN = 1;
const NAME_MAX = 80;

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type SaveKeysResult =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { ok: true; data: { savedCount: number; clearedCount: number; at: number } }
  | { ok: false; error: string };

/**
 * Verify the user's account password against their bcrypt hash.
 * Returns true if the password is correct, false if the user has no
 * password set (OAuth-only) or the password doesn't match.
 */
async function verifyAccountPassword(userId: string, password: string): Promise<boolean> {
  const db = getDb();
  const [user] = await db.select({ hashedPassword: schema.users.hashedPassword })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user?.hashedPassword) return false;
  return bcrypt.compare(password, user.hashedPassword);
}

/**
 * Server action to delete all chat history.
 */
export async function clearChatHistoryAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: 'Unauthorized',
    };
  }

  const rl = await withRateLimit(session.user.id, 'settings_clear_chat', 5);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    await deleteAllThreads(session.user.id);
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update user profile.
 */
export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_profile', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const raw = formData.get('name');
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return {
      ok: false as const,
      error: `Name must be between ${NAME_MIN} and ${NAME_MAX} characters`,
    };
  }

  if (name === session.user.name) {
    revalidatePath('/settings/profile');
    return { ok: true as const };
  }

  try {
    const db = getDb();
    await db
      .update(schema.users)
      .set({ name })
      .where(eq(schema.users.id, session.user.id));

    revalidatePath('/settings/profile');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to add a symbol to watchlist.
 */
export async function addSymbolAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_add_symbol', 30);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  let symbol = formData.get('symbol') as string;
  if (!symbol) {
    return { ok: false as const, error: 'Symbol is required' };
  }
  symbol = symbol.trim().toUpperCase();

  if (symbol.length < 2 || symbol.length > 20) {
    return { ok: false as const, error: 'Symbol must be between 2 and 20 characters' };
  }

  try {
    const db = getDb();

    // Check if the symbol is in the active symbol catalog
    const inCatalog = await db.select({ symbol: schema.symbolCatalog.symbol })
      .from(schema.symbolCatalog)
      .where(and(eq(schema.symbolCatalog.symbol, symbol), eq(schema.symbolCatalog.isActive, true)))
      .limit(1);

    if (inCatalog.length === 0) {
      return { ok: false as const, error: `Symbol "${symbol}" is not supported or active.` };
    }

    // Find highest displayOrder in a single query to avoid race conditions
    const orderResult = await db.select({
      maxOrder: sql<number>`coalesce(max(${schema.userSymbols.displayOrder}), -1)`
    })
      .from(schema.userSymbols)
      .where(eq(schema.userSymbols.userId, session.user.id));

    const nextOrder = (orderResult[0]?.maxOrder ?? -1) + 1;

    await db.insert(schema.userSymbols).values({
      userId: session.user.id,
      symbol,
      displayOrder: nextOrder,
    }).onConflictDoNothing({
      target: [schema.userSymbols.userId, schema.userSymbols.symbol],
    });

    revalidatePath('/settings/symbols');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to remove a symbol from watchlist.
 */
export async function removeSymbolAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_remove_symbol', 30);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const symbol = formData.get('symbol') as string;
  if (!symbol) {
    return { ok: false as const, error: 'Symbol is required' };
  }

  try {
    const db = getDb();
    await db.delete(schema.userSymbols)
      .where(
        and(
          eq(schema.userSymbols.userId, session.user.id),
          eq(schema.userSymbols.symbol, symbol)
        )
      );

    revalidatePath('/settings/symbols');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update usage budget and alerts configuration.
 */
export async function updateUsageSettingsAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_usage', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  const monthlyLimitRaw = formData.get('monthlyBudgetLimit');
  const monthlyBudgetLimit = monthlyLimitRaw && String(monthlyLimitRaw).trim().length > 0 
    ? parseInt(String(monthlyLimitRaw), 10) 
    : null;

  const emailAlert = formData.get('emailAlert') === 'on';
  const telegramAlert = formData.get('telegramAlert') === 'on';

  const providerSpendingThresholds: Record<string, number> = {};
  for (const id of PROVIDER_IDS) {
    const raw = formData.get(`threshold-${id}`);
    if (raw && String(raw).trim().length > 0) {
      const num = parseFloat(String(raw));
      if (!isNaN(num) && num > 0) {
        providerSpendingThresholds[id] = num;
      }
    }
  }

  try {
    const db = getDb();
    await db.update(schema.userSettings)
      .set({
        monthlyBudgetLimit,
        providerSpendingThresholds: Object.keys(providerSpendingThresholds).length > 0 ? providerSpendingThresholds : null,
        spendAlertsConfig: { email: emailAlert, telegram: telegramAlert },
      })
      .where(eq(schema.userSettings.userId, session.user.id));

    revalidatePath('/settings/usage');
    return { ok: true as const };
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

    await db.update(schema.userSettings)
      .set({
        aiApiKeys: Object.keys(keys).length > 0 ? encryptByok(keys) : null,
        aiApiKeysUpdatedAt: Object.keys(newUpdatedAt).length > 0 ? newUpdatedAt : null,
      })
      .where(eq(schema.userSettings.userId, session.user.id));

    const testedAt = new Date();
    for (const id of PROVIDER_IDS) {
      const oldKey = oldDecrypted?.[id];
      const newKey = keys[id];

      if (newKey && newKey !== oldKey) {
        const result = await testProviderKey(id, newKey);
        await db
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, session.user.id),
              eq(schema.providerTests.providerId, id),
            ),
          );
        await db.insert(schema.providerTests).values({
          userId: session.user.id,
          providerId: id,
          ok: result.ok,
          error: result.ok ? null : (result.error ?? 'unknown error'),
          testedAt: testedAt.toISOString(),
        });
      } else if (!newKey && oldKey) {
        await db
          .delete(schema.providerTests)
          .where(
            and(
              eq(schema.providerTests.userId, session.user.id),
              eq(schema.providerTests.providerId, id),
            ),
          );
      }
    }

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
    if (!user.twoFactorSecret || !verifySync({ secret: user.twoFactorSecret, token: totpCode }).valid) {
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

    // Validate the decrypted keys structure
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

    // Build updated-at timestamps for every imported key
    const now = new Date().toISOString();
    const newUpdatedAt: Record<string, string> = {};
    for (const id of Object.keys(validKeys)) {
      newUpdatedAt[id] = now;
    }

    // Save updated keys
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
 * Server action to permanently delete the user's account and all associated data.
 * Requires password confirmation. Cascading DB deletes handle related records.
 */
export async function deleteAccountAction(password: string, totpCode?: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!password) {
    return { ok: false as const, error: 'Password is required' };
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
    if (!user.twoFactorSecret || !verifySync({ secret: user.twoFactorSecret, token: totpCode }).valid) {
      return { ok: false as const, error: 'Invalid 2FA code' };
    }
  }

  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect password' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_delete_account', 2);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    await db.delete(schema.users)
      .where(eq(schema.users.id, session.user.id));
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update AI preferences (custom instructions).
 */
export async function updateAiPrefsAction(customInstructions: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_ai_prefs', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    await db.update(schema.userSettings)
      .set({ customInstructions })
      .where(eq(schema.userSettings.userId, session.user.id));

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

/**
 * Server action to update UI preferences (default symbol, time format, reduced motion).
 */
export async function updateUIPrefsAction(prefs: {
  defaultSymbol?: string;
  timeFormat?: string | null;
  reduceMotion?: boolean;
  theme?: string | null;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_ui_prefs', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    await db.update(schema.userSettings)
      .set(prefs)
      .where(eq(schema.userSettings.userId, session.user.id));

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

export async function listSessionsAction(): Promise<ActionResult<Array<{
  id: string;
  deviceName: string | null;
  ip: string | null;
  createdAt: Date;
  lastActiveAt: Date;
}>>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  try {
    const db = getDb();
    const rows = await db.select({
      id: schema.userSessions.id,
      deviceName: schema.userSessions.deviceName,
      ip: schema.userSessions.ip,
      createdAt: schema.userSessions.createdAt,
      lastActiveAt: schema.userSessions.lastActiveAt,
    })
      .from(schema.userSessions)
      .where(eq(schema.userSessions.userId, session.user.id))
      .orderBy(schema.userSessions.createdAt);

    return { ok: true as const, data: rows };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false as const, error: 'Failed to load sessions' };
  }
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(authSession.user.id, 'settings_revoke_session', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    await db.delete(schema.userSessions)
      .where(and(
        eq(schema.userSessions.id, sessionId),
        eq(schema.userSessions.userId, authSession.user.id),
      ));

    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false as const, error: 'Failed to revoke session' };
  }
}

export async function signOutEverywhereAction(): Promise<ActionResult> {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(authSession.user.id, 'settings_signout_everywhere', 2);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    // Delete all session records for the user
    await db.delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, authSession.user.id));
    // Increment tokenVersion to invalidate JWTs on next refresh
    await db.update(schema.users)
      .set({ tokenVersion: sql`${schema.users.tokenVersion} + 1` })
      .where(eq(schema.users.id, authSession.user.id));

    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false as const, error: 'Failed to sign out everywhere' };
  }
}

/**
 * Server action to update the list of disabled AI tools.
 */
export async function updateDisabledToolsAction(
  disabledTools: string[],
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_disabled_tools', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    await db
      .update(schema.userSettings)
      .set({ disabledTools })
      .where(eq(schema.userSettings.userId, session.user.id));

    revalidatePath('/settings/agent');
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function updateNotificationPrefsAction(prefs: Record<string, Record<string, boolean>>): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_notification_prefs', 10);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    await db.update(schema.userSettings)
      .set({ notificationPreferences: prefs })
      .where(eq(schema.userSettings.userId, session.user.id));

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

/**
 * Server action to generate a TOTP secret and return QR code data URL.
 */
export async function setupTwoFactorAction(): Promise<ActionResult<{ secret: string; qrDataUrl: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_2fa_setup', 5);
  if (!rl.allowed) {
    return { ok: false, error: 'Too many requests. Try again later.' };
  }

  try {
    

    const secret = generateSecret();
    const service = 'HamaFX-Ai';
    const otpauth = generateURI({ secret, issuer: service, label: session.user.email ?? session.user.id });
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Store the secret temporarily (not yet verified)
    const db = getDb();
    await db.update(schema.users)
      .set({ twoFactorSecret: secret })
      .where(eq(schema.users.id, session.user.id));

    return { ok: true, data: { secret, qrDataUrl } };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false, error: 'Failed to generate 2FA setup' };
  }
}

/**
 * Server action to verify a TOTP token and enable 2FA.
 */
export async function verifyTwoFactorAction(token: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_2fa_verify', 10);
  if (!rl.allowed) {
    return { ok: false, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    const [user] = await db.select({ twoFactorSecret: schema.users.twoFactorSecret })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id));

    if (!user?.twoFactorSecret) {
      return { ok: false, error: 'No 2FA secret found. Start setup first.' };
    }

    const isValid = verifySync({ secret: user.twoFactorSecret, token }).valid;

    if (!isValid) {
      return { ok: false, error: 'Invalid code. Try again.' };
    }

    await db.update(schema.users)
      .set({ twoFactorEnabled: true })
      .where(eq(schema.users.id, session.user.id));

    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false, error: 'Failed to verify 2FA code' };
  }
}

/**
 * Server action to disable 2FA (requires current TOTP code).
 */
export async function disableTwoFactorAction(token: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_2fa_disable', 5);
  if (!rl.allowed) {
    return { ok: false, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    const [user] = await db.select({ twoFactorSecret: schema.users.twoFactorSecret })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id));

    if (!user?.twoFactorSecret) {
      return { ok: false, error: '2FA is not configured' };
    }

    const isValid = verifySync({ secret: user.twoFactorSecret, token }).valid;

    if (!isValid) {
      return { ok: false, error: 'Invalid code. Try again.' };
    }

    await db.update(schema.users)
      .set({ twoFactorSecret: null, twoFactorEnabled: false })
      .where(eq(schema.users.id, session.user.id));

    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false, error: 'Failed to disable 2FA' };
  }
}

/**
 * Server action to update the user's locale (BCP 47).
 */
export async function updateLocaleAction(locale: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: 'Unauthorized' };
  }

  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    return { ok: false, error: 'Invalid locale format' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_update_locale', 10);
  if (!rl.allowed) {
    return { ok: false, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    await db.update(schema.userSettings)
      .set({ language: locale })
      .where(eq(schema.userSettings.userId, session.user.id));

    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false, error: 'Failed to update locale' };
  }
}

export async function exportDataAction(): Promise<ActionResult<string>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const rl = await withRateLimit(session.user.id, 'settings_export', 3);
  if (!rl.allowed) {
    return { ok: false as const, error: 'Too many requests. Try again later.' };
  }

  try {
    const db = getDb();
    const userId = session.user.id;

    const [profile] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    const settings = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
    const threads = await db.select().from(schema.chatThreads).where(eq(schema.chatThreads.userId, userId));
    const threadIds = threads.map((t) => t.id);
    const messages = threadIds.length
      ? await db.select().from(schema.chatMessages).where(inArray(schema.chatMessages.threadId, threadIds))
      : [];

    const journalEntries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.userId, userId));
    const alerts = await db.select().from(schema.alerts).where(eq(schema.alerts.userId, userId));
    const symbols = await db.select().from(schema.userSymbols).where(eq(schema.userSymbols.userId, userId));
    const pushSubscriptions = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
    const memories = await db.select().from(schema.memoryEmbeddings).where(eq(schema.memoryEmbeddings.userId, userId));
    const sharedSnapshots = await db.select().from(schema.sharedSnapshots).where(eq(schema.sharedSnapshots.userId, userId));
    const telemetry = await db.select().from(schema.chatTelemetry).where(eq(schema.chatTelemetry.userId, userId));
    const spend = await db.select().from(schema.dailyAiSpend).where(eq(schema.dailyAiSpend.userId, userId));
    const briefings = await db.select().from(schema.briefingsEmitted).where(eq(schema.briefingsEmitted.userId, userId));
    const auditLogs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, userId));

    const data = {
      exportedAt: new Date().toISOString(),
      profile: profile ?? null,
      settings,
      threads: threads.map((t) => ({ ...t, userId: undefined })),
      messages: messages.map((m) => ({ ...m, userId: undefined })),
      journalEntries,
      alerts,
      symbols,
      pushSubscriptions,
      memories,
      sharedSnapshots,
      telemetry,
      spend,
      briefings,
      auditLogs,
    };

    return {
      ok: true as const,
      data: JSON.stringify(data, null, 2),
    };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

