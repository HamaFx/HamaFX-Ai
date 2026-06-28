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
//   - Plaintext shape: { [providerId]: apiKey } — see PROVIDER_IDS for the
//     exhaustive list of supported keys. Adding a provider means adding
//     one field here plus a matching entry in the BYOK registry in
//     @hamafx/ai (packages/ai/src/byok-providers.ts).
//   - Encrypted format: hex(iv) + "." + hex(ciphertext) + "." + hex(authTag)
//   - Never log plaintext keys. Errors reference field names only.

import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, standard for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Canonical list of BYOK provider ids. The encryption payload is keyed
 * by these strings. The runtime registry lives in
 * `@hamafx/ai/src/byok-providers.ts` — keep the two in sync.
 *
 * The types live in `./byok.ts` so test files can reference them
 * without pulling node:crypto / `server-only` into the test bundle.
 * Re-exported here for the existing import path.
 */
export { PROVIDER_IDS, type ByokPayload, type ProviderId } from './byok';
import { PROVIDER_IDS, type ByokPayload, type ProviderId } from './byok';

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

/** List provider ids that have a non-empty key in the given payload. */
export function configuredProviders(payload: ByokPayload | null): ProviderId[] {
  if (!payload) return [];
  return PROVIDER_IDS.filter((id) => {
    const v = payload[id];
    return typeof v === 'string' && v.length > 0;
  });
}

/**
 * Encrypt any payload (JSON serializable) using a user-supplied password.
 * Returns a string formatted as: "salt_hex.iv_hex.ciphertext_hex.authTag_hex"
 */
export function encryptWithPassword(payload: unknown, password: string): string {
  const salt = randomBytes(16);
  // Derive 32-byte key using PBKDF2 with 100k iterations
  const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(payload);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${salt.toString('hex')}.${iv.toString('hex')}.${encrypted}.${authTag.toString('hex')}`;
}

/**
 * Decrypt a payload using a user-supplied password.
 * Returns the decrypted object, or null on failure.
 */
export function decryptWithPassword(encrypted: string, password: string): unknown | null {
  try {
    const parts = encrypted.split('.');
    if (parts.length !== 4) return null;

    const salt = Buffer.from(parts[0]!, 'hex');
    const iv = Buffer.from(parts[1]!, 'hex');
    const ciphertext = parts[2]!;
    const authTag = Buffer.from(parts[3]!, 'hex');

    if (salt.length !== 16 || iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      return null;
    }

    const key = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

// ── Generic secret encryption (Phase 4 — SEC-3) ─────────────────────────
//
// Used for encrypting individual sensitive string values (e.g. Telegram bot
// tokens) that don't need the structured ByokPayload shape. Uses the same
// AES-256-GCM scheme as BYOK keys: same ENCRYPTION_SECRET, same format
// ("iv_hex.ciphertext_hex.authTag_hex"), but encrypts a raw string instead
// of a JSON object.

/**
 * Encrypt a single secret string for storage.
 * Returns a string safe for TEXT columns: "<iv_hex>.<ciphertext_hex>.<authTag_hex>"
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${encrypted}.${authTag.toString('hex')}`;
}

/**
 * Decrypt a secret string from storage.
 * Returns null on any decryption failure (tampered data, wrong key, etc.)
 * so callers can handle gracefully without crashing.
 */
export function decryptSecret(encrypted: string | null | undefined): string | null {
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

    return decrypted;
  } catch {
    return null;
  }
}
