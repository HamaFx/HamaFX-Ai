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

// Security domain actions: 2FA, sessions, password change, sign-out-everywhere, account deletion.

import bcrypt from 'bcryptjs';
import { auth, signOut } from '@/auth';
import { getDb, schema, withRateLimit } from '@hamafx/db';
import { eq, and, sql } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { encryptSecret, decryptSecret } from '@hamafx/shared/encryption';
import { type ActionResult, verifyAccountPassword } from './_actions-shared';

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

    const db = getDb();
    await db.update(schema.users)
      .set({ twoFactorSecret: encryptSecret(secret) })
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

    const decryptedSecret = decryptSecret(user.twoFactorSecret);
    if (!decryptedSecret) {
      return { ok: false, error: '2FA secret is corrupted. Please disable and re-enable 2FA.' };
    }

    const isValid = verifySync({ secret: decryptedSecret, token }).valid;

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

    const decryptedSecret = decryptSecret(user.twoFactorSecret);
    if (!decryptedSecret) {
      return { ok: false, error: '2FA secret is corrupted. Please disable and re-enable 2FA.' };
    }

    const isValid = verifySync({ secret: decryptedSecret, token }).valid;

    if (!isValid) {
      return { ok: false, error: 'Invalid code. Try again.' };
    }

    await db.update(schema.users)
      .set({ twoFactorSecret: null, twoFactorEnabled: false })
      .where(eq(schema.users.id, session.user.id));

    // FEAT-03: Audit log for 2FA disabled
    try {
      await db.insert(schema.auditLogs).values({
        userId: session.user.id,
        action: '2fa_disabled',
        metadata: {},
      });
    } catch { /* fail open */ }

    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    return { ok: false, error: 'Failed to disable 2FA' };
  }
}

export async function listSessionsAction(): Promise<ActionResult<{
  sessions: Array<{
    id: string;
    deviceName: string | null;
    ip: string | null;
    createdAt: Date;
    lastActiveAt: Date;
  }>;
  currentSessionId: string | null;
}>> {
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

    const currentSessionId = (session as { sessionId?: string }).sessionId ?? null;

    return { ok: true as const, data: { sessions: rows, currentSessionId } };
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
 * LOW-04: Change account password.
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  totpCode?: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' };

  const passwordValid = await verifyAccountPassword(session.user.id, currentPassword);
  if (!passwordValid) return { ok: false, error: 'Current password is incorrect' };

  const db = getDb();
  const [user] = await db.select({
    twoFactorEnabled: schema.users.twoFactorEnabled,
    twoFactorSecret: schema.users.twoFactorSecret,
  }).from(schema.users).where(eq(schema.users.id, session.user.id));

  if (user?.twoFactorEnabled) {
    if (!totpCode) return { ok: false, error: '2FA code is required' };
    const secret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!secret || !verifySync({ secret, token: totpCode }).valid) {
      return { ok: false, error: 'Invalid 2FA code' };
    }
  }

  if (newPassword.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(newPassword)) return { ok: false, error: 'Password must contain at least one uppercase letter' };
  if (!/[a-z]/.test(newPassword)) return { ok: false, error: 'Password must contain at least one lowercase letter' };
  if (!/[0-9]/.test(newPassword)) return { ok: false, error: 'Password must contain at least one number' };

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await db.update(schema.users)
    .set({ hashedPassword, tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, session.user.id));

  // FEAT-03: Audit log for password changed
  try {
    await db.insert(schema.auditLogs).values({
      userId: session.user.id,
      action: 'password_changed',
      metadata: {},
    });
  } catch { /* fail open */ }

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * P1-4: Soft-delete user account. Sets deletedAt, bumps tokenVersion to
 * invalidate all sessions, nulls out PII, revokes sessions, and signs out.
 * Requires password + 2FA confirmation. A purge job handles permanent
 * deletion later.
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
    const decryptedSecret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
    if (!decryptedSecret || !verifySync({ secret: decryptedSecret, token: totpCode }).valid) {
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
    const now = new Date();
    await db.update(schema.users)
      .set({
        deletedAt: now,
        tokenVersion: sql`${schema.users.tokenVersion} + 1`,
        name: null,
        image: null,
        email: `deleted-${session.user.id}@deleted.invalid`,
        hashedPassword: null,
        twoFactorSecret: null,
        twoFactorEnabled: false,
      })
      .where(eq(schema.users.id, session.user.id));
    await db.delete(schema.userSessions)
      .where(eq(schema.userSessions.userId, session.user.id));
    await signOut({ redirectTo: '/' });
    return { ok: true as const };
  } catch (err) {
    Sentry.captureException(err);
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
