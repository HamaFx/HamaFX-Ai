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

import { deleteAllThreads } from '@hamafx/ai';
import { auth } from '@/auth';
import { getDb, schema } from '@hamafx/db';
import { eq, asc, and, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import {
  encryptByok,
  decryptByok,
  encryptWithPassword,
  decryptWithPassword,
} from '@hamafx/shared/encryption';

const NAME_MIN = 1;
const NAME_MAX = 80;

/**
 * Server action to delete all chat history.
 */
export async function clearChatHistoryAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      error: 'Unauthorized',
    };
  }

  try {
    await deleteAllThreads(session.user.id);
    return { ok: true as const };
  } catch (err) {
    console.error('[settings] clearChatHistoryAction failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update user profile.
 */
export async function updateProfileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
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
    console.error('[settings] updateProfile failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to add a symbol to watchlist.
 */
export async function addSymbolAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
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
    console.error('[settings] addSymbol failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to remove a symbol from watchlist.
 */
export async function removeSymbolAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
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
    console.error('[settings] removeSymbol failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update usage budget and alerts configuration.
 */
export async function updateUsageSettingsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  const monthlyLimitRaw = formData.get('monthlyBudgetLimit');
  const monthlyBudgetLimit = monthlyLimitRaw && String(monthlyLimitRaw).trim().length > 0 
    ? parseInt(String(monthlyLimitRaw), 10) 
    : null;

  const emailAlert = formData.get('emailAlert') === 'on';
  const telegramAlert = formData.get('telegramAlert') === 'on';

  const PROVIDER_IDS = [
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
  ];

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
    console.error('[settings] updateUsageSettings failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to update the selected market data provider.
 */
export async function updateMarketDataProviderAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
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
    console.error('[settings] updateMarketDataProvider failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Server action to export user API keys.
 * Encrypts the user's saved BYOK payload with a password.
 */
export async function exportKeysAction(password: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!password || password.length < 8) {
    return { ok: false as const, error: 'Password must be at least 8 characters' };
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

    return { ok: true as const, payload: backupPayload };
  } catch (err) {
    console.error('[settings] exportKeys failed', err);
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
export async function importKeysAction(payload: string, password: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  if (!payload || !password) {
    return { ok: false as const, error: 'Payload and password are required' };
  }

  try {
    const decryptedKeys = decryptWithPassword(payload, password) as any;
    if (!decryptedKeys || typeof decryptedKeys !== 'object') {
      return { ok: false as const, error: 'Invalid backup payload or incorrect password' };
    }

    // Validate the decrypted keys structure
    const PROVIDER_IDS = [
      'google',
      'vertex',
      'anthropic',
      'openai',
      'groq',
      'mistral',
      'openrouter',
      'xai',
      'deepseek',
    ];

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
    
    // Save updated keys
    await db.update(schema.userSettings)
      .set({
        aiApiKeys: encryptByok(validKeys),
      })
      .where(eq(schema.userSettings.userId, session.user.id));

    revalidatePath('/settings/api-keys');
    return { ok: true as const, importedCount: Object.keys(validKeys).length };
  } catch (err) {
    console.error('[settings] importKeys failed', err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

