#!/usr/bin/env node
/**
 * P3: Rotate ENCRYPTION_SECRET for encrypted database fields.
 *
 * Usage:
 *   OLD_ENCRYPTION_SECRET=<64 hex chars> \
 *   NEW_ENCRYPTION_SECRET=<64 hex chars> \
 *   ROTATE_ENCRYPTION_SECRET_CONFIRM=YES \
 *   node packages/db/scripts/rotate-encryption-secret.mjs
 *
 * The script is deliberately explicit and fail-closed. It locks, decrypts,
 * and rewrites every encrypted value in one serializable transaction. Any
 * malformed or unreadable value aborts the transaction without changing the
 * database.
 */

import postgres from 'postgres';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const REQUIRED_CONFIRMATION = 'YES';
const REQUIRED_MAINTENANCE_CONFIRMATION = 'STOP_WRITERS';

function getSecret(name) {
  const value = process.env[name];
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be exactly 64 hexadecimal characters`);
  }
  return Buffer.from(value, 'hex');
}

function decrypt(encrypted, key, label) {
  const parts = encrypted.split('.');
  if (parts.length !== 3) throw new Error(`${label} has an invalid encrypted format`);
  const iv = Buffer.from(parts[0], 'hex');
  const ciphertext = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`${label} has invalid encryption metadata`);
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error(`${label} cannot be decrypted with OLD_ENCRYPTION_SECRET`);
  }
}

function encrypt(plaintext, key) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${ciphertext.toString('hex')}.${cipher.getAuthTag().toString('hex')}`;
}

function requireDatabaseUrl() {
  const url =
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error('Set DIRECT_URL (preferred) or POSTGRES_URL_NON_POOLING/DATABASE_URL/POSTGRES_URL');
  }
  return url;
}

if (process.env.ROTATE_ENCRYPTION_SECRET_CONFIRM !== REQUIRED_CONFIRMATION) {
  throw new Error('Set ROTATE_ENCRYPTION_SECRET_CONFIRM=YES to perform encryption-secret rotation');
}
if (process.env.ROTATE_ENCRYPTION_SECRET_MAINTENANCE !== REQUIRED_MAINTENANCE_CONFIRMATION) {
  throw new Error(
    'Stop app/worker writers, then set ROTATE_ENCRYPTION_SECRET_MAINTENANCE=STOP_WRITERS before rotation',
  );
}

const oldKey = getSecret('OLD_ENCRYPTION_SECRET');
const newKey = getSecret('NEW_ENCRYPTION_SECRET');
const sql = postgres(requireDatabaseUrl(), { prepare: false, max: 1, connect_timeout: 10 });

try {
  let summary;
  await sql.begin(async (tx) => {
    // Serialize concurrent maintenance or application writes so no update
    // can be read with the old key and then overwritten after rotation.
    await tx`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`;

    const [counts] = await tx`
      SELECT
        (SELECT count(*)::int FROM user_settings WHERE ai_api_keys IS NOT NULL AND ai_api_keys <> '') AS byok_count,
        (SELECT count(*)::int FROM user_settings WHERE telegram_bot_token IS NOT NULL AND telegram_bot_token <> '') AS telegram_count,
        (SELECT count(*)::int FROM "user" WHERE two_factor_secret IS NOT NULL AND two_factor_secret <> '') AS totp_count
    `;
    const byok = await tx`
      SELECT user_id, ai_api_keys
      FROM user_settings
      WHERE ai_api_keys IS NOT NULL AND ai_api_keys <> ''
      FOR UPDATE
    `;
    const telegram = await tx`
      SELECT user_id, telegram_bot_token
      FROM user_settings
      WHERE telegram_bot_token IS NOT NULL AND telegram_bot_token <> ''
      FOR UPDATE
    `;
    const totp = await tx`
      SELECT id, two_factor_secret
      FROM "user"
      WHERE two_factor_secret IS NOT NULL AND two_factor_secret <> ''
      FOR UPDATE
    `;

    // Preflight every value while locks are held. Any throw rolls back the
    // transaction, so malformed data cannot result in a partial rotation.
    const updates = [];
    for (const row of byok) {
      const plaintext = decrypt(row.ai_api_keys, oldKey, `user_settings.ai_api_keys user=${row.user_id}`);
      const parsed = JSON.parse(plaintext);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`user_settings.ai_api_keys user=${row.user_id} is not a JSON object`);
      }
      updates.push({ table: 'byok', id: row.user_id, value: encrypt(plaintext, newKey) });
    }
    for (const row of telegram) {
      const plaintext = decrypt(
        row.telegram_bot_token,
        oldKey,
        `user_settings.telegram_bot_token user=${row.user_id}`,
      );
      updates.push({ table: 'telegram', id: row.user_id, value: encrypt(plaintext, newKey) });
    }
    for (const row of totp) {
      const plaintext = decrypt(row.two_factor_secret, oldKey, `user.two_factor_secret user=${row.id}`);
      updates.push({ table: 'totp', id: row.id, value: encrypt(plaintext, newKey) });
    }

    for (const update of updates) {
      if (update.table === 'byok') {
        await tx`UPDATE user_settings SET ai_api_keys = ${update.value} WHERE user_id = ${update.id}`;
      } else if (update.table === 'telegram') {
        await tx`UPDATE user_settings SET telegram_bot_token = ${update.value} WHERE user_id = ${update.id}`;
      } else {
        await tx`UPDATE "user" SET two_factor_secret = ${update.value} WHERE id = ${update.id}`;
      }
    }

    summary = counts;
  });

  console.log(
    `Encryption-secret rotation completed: byok=${summary.byok_count} telegram=${summary.telegram_count} totp=${summary.totp_count}`,
  );
} finally {
  await sql.end({ timeout: 5 });
}
