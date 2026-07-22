// SPDX-License-Identifier: Apache-2.0

// Shared types, constants, and helpers used by the settings domain action files.
// Imported by each domain file to avoid circular dependencies and duplication.

import bcrypt from 'bcryptjs';
import { getUserPasswordHash } from '@hamafx/db';

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
  const hashedPassword = await getUserPasswordHash(userId);
  if (!hashedPassword) return false;
  return bcrypt.compare(password, hashedPassword);
}
