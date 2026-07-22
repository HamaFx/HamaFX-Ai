// SPDX-License-Identifier: Apache-2.0

// P0-6: Token hashing for verification tokens.
// Tokens are stored as SHA-256 hashes; the raw token is emailed to the user.
// This prevents DB-leak replay attacks.

import { createHash, randomBytes } from 'node:crypto';

/** Generate a raw token (emailed to user) and its SHA-256 hash (stored in DB). */
export function generateToken(): { raw: string; hashed: string } {
  const raw = randomBytes(32).toString('hex');
  const hashed = hashToken(raw);
  return { raw, hashed };
}

/** Hash a raw token with SHA-256 for storage/lookup. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Token purpose discriminator — prevents cross-flow replay (P0-6). */
export type TokenPurpose = 'email_verify' | 'password_reset';
