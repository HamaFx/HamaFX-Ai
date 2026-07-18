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

// Shared types, constants, and helpers used by the settings domain action files.
// Imported by each domain file to avoid circular dependencies and duplication.

import bcrypt from 'bcryptjs';
import { getDb, schema } from '@hamafx/db';
import { eq } from 'drizzle-orm';

export const NAME_MIN = 1;
export const NAME_MAX = 80;

export type ActionResult<T = void> =
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
export async function verifyAccountPassword(userId: string, password: string): Promise<boolean> {
  const db = getDb();
  const [user] = await db.select({ hashedPassword: schema.users.hashedPassword })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user?.hashedPassword) return false;
  return bcrypt.compare(password, user.hashedPassword);
}
