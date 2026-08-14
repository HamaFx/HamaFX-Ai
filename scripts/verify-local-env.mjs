#!/usr/bin/env node
/**
 * Read-only local environment guard.
 *
 * It intentionally reports variable names, never values. This catches the two
 * local build hazards that otherwise look like application failures:
 * legacy auth being inherited by Next and TLS verification being disabled for
 * database access.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2] ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {
  ...loadDotEnv(resolve(root, '.env.production.local')),
  ...loadDotEnv(resolve(root, '.env.local')),
  ...process.env,
};
const failures = [];
const warnings = [];

if (env.AUTH_MODE === 'legacy' && env.ALLOW_LEGACY_LOCAL !== '1') {
  failures.push('AUTH_MODE=legacy (use AUTH_MODE=normal for local production-like verification)');
}
if ((env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || env.DB_DISABLE_SSL === 'true') && env.ALLOW_INSECURE_LOCAL_TLS !== '1') {
  failures.push('TLS verification is disabled (remove NODE_TLS_REJECT_UNAUTHORIZED=0/DB_DISABLE_SSL=true)');
}
if (env.NODE_ENV === 'production') {
  for (const key of ['AUTH_SECRET', 'NEXTAUTH_SECRET', 'ENCRYPTION_SECRET', 'CRON_SECRET']) {
    if (!env[key]) warnings.push(`${key} is not present in the local production environment`);
  }
}
if (!env.DATABASE_URL && !env.POSTGRES_URL) warnings.push('DATABASE_URL/POSTGRES_URL is not configured');

for (const warning of warnings) console.warn(`[verify-local] warning: ${warning}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`[verify-local] fix: ${failure}`);
  console.error('[verify-local] FAILED. Use ALLOW_* only for an intentional temporary test override.');
  process.exitCode = 1;
} else {
  console.log('[verify-local] environment is production-like (no insecure auth/TLS overrides detected)');
}
