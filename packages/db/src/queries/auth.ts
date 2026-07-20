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

// Auth query helpers — login, registration, password reset, verification tokens.

import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../client';

export interface AuthUserRow {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  hashedPassword: string | null;
  tokenVersion: number;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  emailVerified: Date | null;
}

/**
 * Get a user by email (non-deleted). Returns all auth-relevant fields.
 * Used by the credentials authorize flow.
 */
export async function getUserByEmail(email: string): Promise<AuthUserRow | null> {
  const db = getDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
      hashedPassword: schema.users.hashedPassword,
      tokenVersion: schema.users.tokenVersion,
      twoFactorEnabled: schema.users.twoFactorEnabled,
      twoFactorSecret: schema.users.twoFactorSecret,
      lockedUntil: schema.users.lockedUntil,
      failedLoginAttempts: schema.users.failedLoginAttempts,
      emailVerified: schema.users.emailVerified,
    })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
    .limit(1);
  return user ?? null;
}

/**
 * Increment the failed login attempts counter. If the count reaches 5,
 * also set lockedUntil to NOW + 15 minutes.
 */
export async function incrementFailedLogins(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({
      failedLoginAttempts: sql`${schema.users.failedLoginAttempts} + 1`,
      lockedUntil: sql`CASE WHEN ${schema.users.failedLoginAttempts} + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END`,
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Reset failed login attempts and lockout.
 */
export async function resetLoginLockout(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(schema.users.id, userId));
}

/** Input for creating a new user + userSettings in a transaction. */
export interface CreateUserInput {
  id: string;
  email: string;
  name: string;
  hashedPassword: string;
}

/**
 * Create a new user, userSettings, and email verification token in a single transaction.
 * Returns the raw verification token (for constructing the verify URL) and the user.
 */
export async function createUserWithSettings(
  input: CreateUserInput,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values({
      id: input.id,
      email: input.email,
      name: input.name,
      hashedPassword: input.hashedPassword,
      image: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(input.name)}`,
    });
    await tx.insert(schema.userSettings).values({
      userId: input.id,
      onboardingCompleted: false,
      defaultSymbol: 'XAUUSD',
    });
  });
}

/**
 * Check if a user already exists by email (not deleted).
 */
export async function userExistsByEmail(email: string): Promise<boolean> {
  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return !!user;
}

/**
 * Update a user's password, incrementing tokenVersion to invalidate sessions.
 */
export async function updateUserPassword(userId: string, hashedPassword: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({
      hashedPassword,
      tokenVersion: sql`${schema.users.tokenVersion} + 1`,
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Update a user's password by email (for password reset flow).
 */
export async function updatePasswordByEmail(email: string, hashedPassword: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .update(schema.users)
    .set({
      hashedPassword,
      tokenVersion: sql`${schema.users.tokenVersion} + 1`,
    })
    .where(eq(schema.users.email, email))
    .returning({ id: schema.users.id });
  return user?.id ?? null;
}

/** Create a verification token (email_verify or password_reset). */
export async function createVerificationToken(
  identifier: string,
  hashedToken: string,
  purpose: string,
  expires: Date,
): Promise<void> {
  const db = getDb();
  await db.insert(schema.verificationTokens).values({
    identifier,
    token: hashedToken,
    purpose,
    expires,
  });
}

/** Find a non-expired verification token by hash + purpose. */
export async function findVerificationToken(
  hashedToken: string,
  purpose: string,
) {
  const db = getDb();
  const [vt] = await db
    .select()
    .from(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, purpose),
        gt(schema.verificationTokens.expires, new Date()),
      ),
    )
    .limit(1);
  return vt ?? null;
}

/** Delete a verification token by hash + purpose (single-use). */
export async function deleteVerificationToken(
  hashedToken: string,
  purpose: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashedToken),
        eq(schema.verificationTokens.purpose, purpose),
      ),
    );
}

/**
 * Verify a user's email (set emailVerified to now).
 */
export async function verifyUserEmail(email: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ emailVerified: new Date() })
    .where(eq(schema.users.email, email));
}

/**
 * Get a user's tokenVersion for session validation.
 */
export async function getTokenVersion(userId: string): Promise<number | null> {
  const db = getDb();
  const [u] = await db
    .select({ tv: schema.users.tokenVersion })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return u?.tv ?? null;
}

/**
 * Check if a session still exists (not revoked).
 */
export async function findSession(sessionId: string): Promise<boolean> {
  const db = getDb();
  const [sess] = await db
    .select({ id: schema.userSessions.id })
    .from(schema.userSessions)
    .where(eq(schema.userSessions.id, sessionId))
    .limit(1);
  return !!sess;
}

/**
 * Update session last active time.
 */
export async function updateSessionLastActive(sessionId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.userSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(schema.userSessions.id, sessionId));
}

/**
 * Create a user session row (JWT callback).
 */
export async function createUserSession(
  sessionId: string,
  userId: string,
  deviceName: string | null,
  ip: string | null,
): Promise<void> {
  const db = getDb();
  await db.execute(
    sql`INSERT INTO ${schema.userSessions} (id, user_id, device_name, ip)
        VALUES (${sessionId}, ${userId}, ${deviceName}, ${ip})`,
  );
}

/**
 * Update the two-factor secret for a user (stores encrypted secret).
 */
export async function updateTwoFactorSecret(userId: string, encryptedSecret: string | null): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ twoFactorSecret: encryptedSecret })
    .where(eq(schema.users.id, userId));
}

/**
 * Get a user's two-factor secret.
 */
export async function getTwoFactorSecret(userId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .select({ twoFactorSecret: schema.users.twoFactorSecret })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.twoFactorSecret ?? null;
}

/**
 * Enable or disable 2FA for a user.
 */
export async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ twoFactorEnabled: enabled })
    .where(eq(schema.users.id, userId));
}

/**
 * Update user's API keys (encrypted BYOK payload) and updatedAt map.
 */
export async function updateUserApiKeys(
  userId: string,
  encryptedKeys: string | null,
  keysUpdatedAt: Record<string, string> | null,
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.userSettings)
    .set({
      aiApiKeys: encryptedKeys,
      ...(keysUpdatedAt !== null ? { aiApiKeysUpdatedAt: keysUpdatedAt } : {}),
    })
    .where(eq(schema.userSettings.userId, userId));
}

/**
 * Increment the tokenVersion for a user (invalidates all active JWTs).
 */
export async function incrementTokenVersion(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ tokenVersion: sql`${schema.users.tokenVersion} + 1` })
    .where(eq(schema.users.id, userId));
}

/**
 * Update a user's display name.
 */
export async function updateUserDisplayName(userId: string, name: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ name })
    .where(eq(schema.users.id, userId));
}

/** Create an audit log entry (best-effort, fail open). */
export async function createAuditLog(
  userId: string,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.auditLogs).values({ userId, action, metadata });
  } catch {
    // fail open — audit logging is best-effort
  }
}
