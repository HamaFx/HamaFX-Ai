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
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

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

export async function ensureTestUser(email = 'test@example.com', password = 'password123') {
  const db = getDb();
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  const result = await db.insert(schema.users).values({
    id,
    email,
    name: 'Test User',
    hashedPassword,
    role: 'user',
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
