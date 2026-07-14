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
