// SPDX-License-Identifier: Apache-2.0

// Lazy, cached env access. Three scopes:
//   - getAuthEnv(): only auth-related vars. Safe to use from Edge middleware
//     because it doesn't require AI / DB / data-provider keys to be set.
//   - getServerEnv(): the full ServerEnv (Auth + DB + AI + Cache + Providers + ...).
//     Used by route handlers that actually need those keys.
//
// Phase A: added NEXTAUTH_SECRET for NextAuth.js v5 JWT signing.
// APP_PASSWORD is now optional — used only for legacy admin bootstrapping.
//
// Phase 10 (setup UX): secrets are OPTIONAL in dev mode. The first call
// to either getter triggers `loadOrGenerateDevSecrets()` which:
//   - reads `.hamafx/dev-secrets.json` if present,
//   - otherwise generates cryptographically-strong values,
//   - persists them so BYOK-encrypted payloads survive restarts,
//   - sets them on `process.env` so the schema validates clean.
// In production every secret must be supplied via env — the shared
// schema's refinement rejects missing values with NODE_ENV=production.
//
// We never throw at import time — errors surface on first call so a missing
// env doesn't break unrelated routes during dev.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateSecret,
  AUTO_GENERATED_SECRETS,
  SECRET_MIN_BYTES,
} from '@hamafx/shared/env-secrets';
import { parseServerEnv, type ServerEnv } from '@hamafx/shared';
import { z } from 'zod';

const AuthEnvSchema = z.object({
  // MED-04: Standardize on AUTH_SECRET (NextAuth v5 convention).
  // NEXTAUTH_SECRET kept as deprecated fallback for backward compatibility.
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 chars').optional(),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 chars').optional(),
  APP_PASSWORD: z.string().min(4).optional(),
  AUTH_COOKIE_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 chars').optional(),
  ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 chars').optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  // FEAT-01: Optional OAuth provider credentials
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
});

export type AuthEnv = z.infer<typeof AuthEnvSchema>;

let _authEnv: AuthEnv | null = null;
let _serverEnv: ServerEnv | null = null;

// -----------------------------------------------------------------------
// Dev secret persistence
// -----------------------------------------------------------------------

/**
 * Path where dev-mode generated secrets are persisted. Lives inside the
 * already-gitignored `.hamafx/` directory so it never reaches the public
 * repo. Mode 0600 on creation so other local users can't read the keys.
 */
const DEV_SECRETS_PATH = resolve('.hamafx/dev-secrets.json');

type DevSecretStore = Partial<Record<(typeof AUTO_GENERATED_SECRETS)[number], string>>;

function readDevSecrets(): DevSecretStore {
  try {
    if (!existsSync(DEV_SECRETS_PATH)) return {};
    const raw = readFileSync(DEV_SECRETS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as DevSecretStore;
  } catch {
    // Corrupted file — fall through to regeneration. We'll overwrite below.
  }
  return {};
}

function writeDevSecrets(store: DevSecretStore): void {
  mkdirSync(resolve('.hamafx'), { recursive: true });
  writeFileSync(DEV_SECRETS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * Ensure every auto-generatable secret exists on `process.env`. In dev
 * mode (NODE_ENV !== 'production') we either reuse a previously
 * persisted value or generate a fresh one. In production we do nothing
 * here — the server schema's refinement will throw if a required
 * secret is missing.
 *
 * Returns the store so callers can warn the user on first-time generation.
 */
export function loadOrGenerateDevSecrets(): {
  generated: boolean;
  store: DevSecretStore;
} {
  if (process.env.NODE_ENV === 'production') {
    return { generated: false, store: {} };
  }

  const store = readDevSecrets();
  let generated = false;

  for (const key of AUTO_GENERATED_SECRETS) {
    if (process.env[key]) continue;
    if (store[key]) {
      process.env[key] = store[key];
      continue;
    }
    const value = generateSecret(SECRET_MIN_BYTES[key]);
    process.env[key] = value;
    store[key] = value;
    generated = true;
  }

  if (generated) {
    try {
      writeDevSecrets(store);
      console.warn(
        `[env] Generated dev secrets persisted to ${DEV_SECRETS_PATH}. ` +
          'Set explicit NEXTAUTH_SECRET / ENCRYPTION_SECRET / CRON_SECRET before deploying.',
      );
    } catch (err) {
      console.warn(
        `[env] Generated dev secrets but failed to persist (${err instanceof Error ? err.message : String(err)}). ` +
          'BYOK-encrypted keys will be unreadable after the next restart.',
      );
    }
  }

  return { generated, store };
}

export function getAuthEnv(): AuthEnv {
  if (_authEnv) return _authEnv;
  loadOrGenerateDevSecrets();
  const result = AuthEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid auth environment:\n${issues}`);
  }
  _authEnv = result.data;
  return _authEnv;
}

export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  loadOrGenerateDevSecrets();
  _serverEnv = parseServerEnv();
  return _serverEnv;
}

// MED-05: Startup warning if AUTH_MODE=legacy is set in production
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] AUTH_MODE=legacy is set in production! Authentication is disabled.');
}

// P2-5: Loud boot warning when AUTH_MODE=legacy is on in dev
if (process.env.AUTH_MODE === 'legacy' && process.env.NODE_ENV !== 'production') {
  console.warn(
    '[AUTH] AUTH_MODE=legacy is enabled — all requests will use __system__ user. ' +
      'Set AUTH_MODE=normal (or unset) for multi-user authentication.',
  );
}

// MED-04: Deprecation warning for NEXTAUTH_SECRET
if (process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
  console.warn('[env] NEXTAUTH_SECRET is deprecated. Use AUTH_SECRET instead.');
}

// Trigger validation immediately at startup (skip in test runner and build phase)
if (
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  getAuthEnv();
  getServerEnv();
}