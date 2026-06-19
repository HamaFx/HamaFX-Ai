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

// BYOK (Bring Your Own Key) encryption utilities.
//
// Users provide their own AI provider API keys via the settings UI.
// Keys are encrypted at rest using AES-256-GCM before storage in
// `user_settings.ai_api_keys`. The encryption key is derived from
// `ENCRYPTION_SECRET` (32-byte hex, provided via env).
//
// SERVER-ONLY: This module imports `node:crypto` and must not be pulled
// into a client component. The `server-only` import is a build-time guard
// that throws if any client bundle tries to include it. The barrel
// re-exports in @hamafx/shared will then fail loudly in the next build,
// pointing the developer at whichever client import is the culprit.
//
// Design:
//   - Plaintext shape: { openai?: string; anthropic?: string; google?: string }
//   - Encrypted format: hex(iv) + "." + hex(ciphertext) + "." + hex(authTag)
//   - Never log plaintext keys. Errors reference field names only.

import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, standard for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/** Shape of the decrypted BYOK payload stored in user_settings.ai_api_keys. */
export interface ByokPayload {
  openai?: string;
  anthropic?: string;
  google?: string;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET not set — cannot encrypt/decrypt BYOK keys');
  }
  const key = Buffer.from(secret, 'hex');
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_SECRET must be 32 bytes (64 hex chars), got ${secret.length} chars (${key.length} bytes)`,
    );
  }
  return key;
}

/**
 * Encrypt a BYOK payload for storage.
 * Returns a string safe for TEXT columns: "<iv_hex>.<ciphertext_hex>.<authTag_hex>"
 */
export function encryptByok(payload: ByokPayload): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(payload);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${encrypted}.${authTag.toString('hex')}`;
}

/**
 * Decrypt a BYOK payload from storage.
 * Returns null on any decryption failure (tampered data, wrong key, etc.)
 * so callers can handle gracefully without crashing.
 */
export function decryptByok(encrypted: string | null | undefined): ByokPayload | null {
  if (!encrypted) return null;

  try {
    const parts = encrypted.split('.');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0]!, 'hex');
    const ciphertext = parts[1]!;
    const authTag = Buffer.from(parts[2]!, 'hex');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) return null;

    const key = getEncryptionKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    const parsed = JSON.parse(decrypted);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ByokPayload;
  } catch {
    return null;
  }
}

/**
 * Sanitize a BYOK payload for logging — show which keys are set, never values.
 */
export function describeByok(payload: ByokPayload | null): string {
  if (!payload) return 'none';
  const providers = Object.entries(payload)
    .filter(([, v]) => typeof v === 'string' && v.length > 0)
    .map(([k]) => k);
  return providers.length > 0 ? providers.join(', ') : 'none';
}
