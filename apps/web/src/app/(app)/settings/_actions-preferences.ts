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

// Preferences domain actions: profile, UI, AI prefs, notifications, usage budget, symbols, locale.

import { auth } from '@/auth';
import { getDb, schema, withRateLimit } from '@hamafx/db';
import { eq, and, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { PROVIDER_IDS } from '@hamafx/shared/encryption';
import { type ActionResult, NAME_MIN, NAME_MAX } from './_actions-shared';

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

/**
 * Server action to update notification preferences.
 */
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
    // Merge with existing notification preferences to preserve nested
    // fields like noiseConfig that aren't managed through this action.
    const [existing] = await db.select({ notificationPreferences: schema.userSettings.notificationPreferences })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, session.user.id));
    const merged = { ...(existing?.notificationPreferences as Record<string, unknown> || {}), ...prefs };
    await db.update(schema.userSettings)
      .set({ notificationPreferences: merged as Record<string, Record<string, boolean>> })
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

    const inCatalog = await db.select({ symbol: schema.symbolCatalog.symbol })
      .from(schema.symbolCatalog)
      .where(and(eq(schema.symbolCatalog.symbol, symbol), eq(schema.symbolCatalog.isActive, true)))
      .limit(1);

    if (inCatalog.length === 0) {
      return { ok: false as const, error: `Symbol "${symbol}" is not supported or active.` };
    }

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
