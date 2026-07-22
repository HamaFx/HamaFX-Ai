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

import { createCipheriv, randomBytes } from 'node:crypto';
import { encode } from '@auth/core/jwt';
import { getDb, schema } from '@hamafx/db';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { Page } from '@playwright/test';

/**
 * Encrypt a dummy BYOK payload for the test user so the chat page
 * does not redirect to /settings/api-keys (Phase A item 4).
 *
 * Uses the same AES-256-GCM scheme as @hamafx/shared/encryption
 * but avoids importing it (server-only guard would throw outside
 * of Next.js bundler context). The ENCRYPTION_SECRET env var must
 * be set (loaded by global-setup.ts from .env.local).
 */
function encryptDummyByokKey(): string | null {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) return null;
  try {
    const key = Buffer.from(secret, 'hex');
    if (key.length !== 32) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const payload = JSON.stringify({ groq: 'gsk_e2e-test-dummy-key' });
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}.${encrypted}.${authTag.toString('hex')}`;
  } catch {
    return null;
  }
}

export async function ensureTestUser(email = 'test@example.com', password = 'password123', role: 'user' | 'admin' = 'user') {
  const db = getDb();
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  const result = await db.insert(schema.users).values({
    id,
    email,
    name: 'Test User',
    hashedPassword,
    role,
  }).onConflictDoUpdate({
    target: schema.users.email,
    set: { hashedPassword }
  }).returning();

  const user = result[0];

  // Encrypt a dummy API key so the chat page sees a configured
  // provider and doesn't redirect to /settings/api-keys.
  const encryptedKey = encryptDummyByokKey();

  await db.insert(schema.userSettings).values({
    userId: user.id,
    defaultSymbol: 'XAUUSD',
    timezone: 'UTC',
    language: 'en',
    onboardingCompleted: true,
    ...(encryptedKey ? { aiApiKeys: encryptedKey } : {}),
  }).onConflictDoUpdate({
    target: schema.userSettings.userId,
    set: { 
      onboardingCompleted: true,
      ...(encryptedKey ? { aiApiKeys: encryptedKey } : {}),
    }
  });

  return user;
}

/**
 * Create a valid NextAuth session JWT and userSessions row for the given
 * test user. Returns a Playwright cookie object that can be set via
 * `page.context().addCookies([cookie])`.
 *
 * This bypasses the UI login flow, which has a known incompatibility
 * between React 19's useActionState and NextAuth v5 beta's redirect
 * handling (useActionState swallows NEXT_REDIRECT throws).
 */
export async function createSessionForUser(user: { id: string; email: string; name: string | null }) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET must be set for E2E session creation');

  const maxAge = 30 * 24 * 60 * 60; // 30 days, matches auth.config.ts session.maxAge
  const sessionId = crypto.randomUUID();

  // Create a userSessions row so the session callback's validation passes
  const db = getDb();
  try {
    await db.execute(
      sql`INSERT INTO ${schema.userSessions} (id, user_id, device_name, ip)
          VALUES (${sessionId}, ${user.id}, ${'E2E Test'}, ${null})`,
    );
  } catch {
    // Row may already exist from a previous run — ignore
  }

  // Build the JWT with the same claims NextAuth uses (see auth.ts JWT callback).
  // Pass salt as a Buffer — @panva/hkdf (used by @auth/core/jwt) requires
  // Uint8Array in newer versions rather than a plain string.
  const salt = Buffer.from('authjs.session-token');
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name ?? 'Test User',
      picture: null,
      tokenVersion: 0,
      emailVerified: new Date().toISOString(),
      rememberMe: true,
      sessionId,
    },
    secret,
    maxAge,
    salt,
  });

  // The cookie name NextAuth uses for the session token.
  // On localhost (HTTP) it's 'authjs.session-token'.
  const cookieName =
    process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token';

  // Playwright addCookies requires either url OR domain+path.
  // Use domain+path to match the cookie scope NextAuth uses.
  return {
    name: cookieName,
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
  };
}

/**
 * Authenticate a Playwright page by creating a test user in the DB and
 * injecting a valid NextAuth session cookie. This bypasses the UI login
 * form entirely — use when a test just needs to be authenticated, not
 * when it needs to verify the login flow itself.
 *
 * Usage:
 *   await authenticateAs(page, 'admin@example.com', 'password123', 'admin');
 *
 * Returns the DB user record so callers can reference user.id if needed.
 */
export async function authenticateAs(
  page: Page,
  email: string,
  password: string,
  role: 'user' | 'admin' = 'user',
) {
  return user;
}

/**
 * Create the __system__ user in the DB with the exact id '__system__'.
 * Required for AUTH_MODE=legacy E2E tests — the chat page and middleware
 * use this user ID when bypassing auth. Without this row, FK constraints
 * on threads/settings fail.
 */
export async function ensureSystemUser() {
  const db = getDb();
  const encryptedKey = encryptDummyByokKey();

  await db
    .insert(schema.users)
    .values({
      id: '__system__',
      email: '__system__@hamafx.ai',
      name: 'System (Legacy E2E)',
      hashedPassword: await bcrypt.hash('password123', 10),
      role: 'user',
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: { name: 'System (Legacy E2E)' },
    });

  await db
    .insert(schema.userSettings)
    .values({
      userId: '__system__',
      defaultSymbol: 'XAUUSD',
      timezone: 'UTC',
      language: 'en',
      onboardingCompleted: true,
      ...(encryptedKey ? { aiApiKeys: encryptedKey } : {}),
    })
    .onConflictDoUpdate({
      target: schema.userSettings.userId,
      set: {
        onboardingCompleted: true,
        ...(encryptedKey ? { aiApiKeys: encryptedKey } : {}),
      },
    });
}
