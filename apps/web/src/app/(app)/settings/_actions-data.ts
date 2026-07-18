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

// Data actions: clear chat history, data export.

import { deleteAllThreads } from '@hamafx/ai';
import { auth } from '@/auth';
import { getDb, schema, withRateLimit } from '@hamafx/db';
import { eq, inArray } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { verifySync } from 'otplib';
import { decryptSecret } from '@hamafx/shared/encryption';
import { type ActionResult, verifyAccountPassword } from './_actions-shared';

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

export async function exportDataAction(password?: string, totpCode?: string): Promise<ActionResult<string>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: 'Unauthorized' };
  }

  // Require password verification for data export (3.6.1)
  if (!password || password.length < 8) {
    return { ok: false as const, error: 'Password is required to export your data' };
  }

  // Check 2FA if enabled
  const db = getDb();
  const [user] = await db.select({
    twoFactorEnabled: schema.users.twoFactorEnabled,
    twoFactorSecret: schema.users.twoFactorSecret,
  }).from(schema.users).where(eq(schema.users.id, session.user.id));

  if (user?.twoFactorEnabled) {
    if (!totpCode) {
      return { ok: false as const, error: '2FA code is required to export your data' };
    }
    const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!decryptedSecret || !verifySync({ secret: decryptedSecret, token: totpCode }).valid) {
      return { ok: false as const, error: 'Invalid 2FA code' };
    }
  }

  const passwordValid = await verifyAccountPassword(session.user.id, password);
  if (!passwordValid) {
    return { ok: false as const, error: 'Incorrect account password' };
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

    // Strip userId from all exported records for security (3.6.2)
    const data = {
      exportedAt: new Date().toISOString(),
      profile: profile ? { ...profile, hashedPassword: undefined, twoFactorSecret: undefined } : null,
      settings: settings.map((s) => ({ ...s, userId: undefined, aiApiKeys: undefined })),
      threads: threads.map((t) => ({ ...t, userId: undefined })),
      messages: messages.map((m) => ({ ...m, userId: undefined })),
      journalEntries: journalEntries.map((e) => ({ ...e, userId: undefined })),
      alerts: alerts.map((a) => ({ ...a, userId: undefined })),
      symbols: symbols.map((s) => ({ ...s, userId: undefined })),
      pushSubscriptions: pushSubscriptions.map((s) => ({ ...s, userId: undefined })),
      memories: memories.map((m) => ({ ...m, userId: undefined })),
      sharedSnapshots: sharedSnapshots.map((s) => ({ ...s, userId: undefined })),
      telemetry: telemetry.map((t) => ({ ...t, userId: undefined })),
      spend: spend.map((s) => ({ ...s, userId: undefined })),
      briefings: briefings.map((b) => ({ ...b, userId: undefined })),
      auditLogs: auditLogs.map((a) => ({ ...a, userId: undefined })),
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
