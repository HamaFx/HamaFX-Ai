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

// Phase 3 §3.9 — Centralized secrets delivery.
//
// Both the hosted Vercel frontend and the GCE worker should fetch secrets
// from a vault (e.g. GCP Secret Manager, Infisical) at runtime instead of
// relying solely on `.env` files. This module provides:
//
//   1. `loadSecretsFromVault()` — fetches secrets from GCP Secret Manager
//      and injects them into `process.env`. Called once at boot before
//      `parseServerEnv()`.
//   2. `withVaultSecrets()` — wrapper that loads vault secrets, then runs
//      a callback. Used by the worker entrypoint and Vercel's
//      `instrumentation.ts`.
//
// When `SECRETS_VAULT_PROVIDER` is not set (or set to `none`), this module
// is a no-op — `.env` files remain the source of truth. This preserves
// self-host / legacy compatibility.
//
// The existing BYOK AES-256-GCM encryption for user-provided API keys
// (`packages/shared/src/encryption.ts`) is correctly implemented and is
// NOT touched here — it stays as-is.
//
// Supported providers:
//   - `gcp-secret-manager`: fetches from GCP Secret Manager. Requires
//     `GCP_PROJECT_ID` and the runtime to have Application Default
//     Credentials (ADC) available (automatic on GCE / Cloud Run).
//   - `none` / unset: no-op (use .env files as before).

/** Names of secrets to fetch from the vault. */
const VAULT_SECRET_NAMES = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'DIRECT_URL',
  'POSTGRES_URL_NON_POOLING',
  'SUPABASE_CA_CERT',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'AUTH_COOKIE_SECRET',
  'CRON_SECRET',
  'ENCRYPTION_SECRET',
  'AI_GATEWAY_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_VERTEX_PROJECT',
  'GOOGLE_VERTEX_LOCATION',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AI_DEFAULT_MODEL',
  'AI_EMBEDDING_MODEL',
  'MAX_DAILY_USD',
  'SENTRY_DSN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_SECRET_TOKEN',
  'APP_PASSWORD',
  'AUTH_MODE',
] as const;

/** Whether vault loading has already run (idempotency guard). */
let _vaultLoaded = false;

/**
 * Fetch a single secret from GCP Secret Manager.
 * Uses the Secret Manager REST API with Application Default Credentials
 * obtained from the GCE metadata server. This avoids a hard dependency
 * on `google-auth-library` — the vault loader works with zero extra
 * packages on any GCE / Cloud Run instance (which have ADC built in).
 */
async function getGcpAccessToken(): Promise<string | null> {
  // On GCE / Cloud Run, the metadata server provides ADC tokens.
  // The 'Metadata-Flavor: Google' header is required.
  const metadataUrl =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

  try {
    const res = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
    });

    if (!res.ok) {
      console.warn(`[vault] Metadata server returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (err) {
    console.warn('[vault] Failed to get GCP access token from metadata server:', err);
    return null;
  }
}

async function fetchGcpSecret(
  projectId: string,
  secretName: string,
  accessToken: string,
): Promise<string | null> {
  // GCP Secret Manager access endpoint.
  const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretName}/versions/latest:access`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 404) return null; // Secret doesn't exist — skip
      console.warn(`[vault] GCP Secret Manager returned ${res.status} for ${secretName}`);
      return null;
    }

    const data = (await res.json()) as { payload?: { data?: string } };
    if (!data.payload?.data) return null;

    // Secret Manager returns base64-encoded values.
    return Buffer.from(data.payload.data, 'base64').toString('utf-8');
  } catch (err) {
    console.warn(`[vault] Failed to fetch ${secretName} from GCP Secret Manager:`, err);
    return null;
  }
}

/**
 * Load secrets from the configured vault provider into `process.env`.
 *
 * This is idempotent — calling it multiple times is safe but only the
 * first call actually fetches from the vault.
 *
 * When `SECRETS_VAULT_PROVIDER` is unset or `none`, this is a no-op.
 *
 * Existing `process.env` values take precedence — vault secrets only
 * fill in missing keys. This ensures local dev with `.env` files
 * continues to work unchanged.
 */
export async function loadSecretsFromVault(): Promise<void> {
  if (_vaultLoaded) return;
  _vaultLoaded = true;

  const provider = process.env.SECRETS_VAULT_PROVIDER ?? 'none';

  if (provider === 'none' || !provider) return;

  if (provider === 'gcp-secret-manager') {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) {
      console.warn('[vault] SECRETS_VAULT_PROVIDER=gcp-secret-manager but GCP_PROJECT_ID is not set');
      return;
    }

    console.info(`[vault] Loading secrets from GCP Secret Manager (project: ${projectId})`);

    const accessToken = await getGcpAccessToken();
    if (!accessToken) {
      console.warn('[vault] Could not obtain GCP access token — skipping vault load');
      return;
    }

    let loaded = 0;
    for (const name of VAULT_SECRET_NAMES) {
      // Don't overwrite existing env values — .env / Vercel env takes precedence.
      if (process.env[name]) continue;

      const value = await fetchGcpSecret(projectId, name, accessToken);
      if (value !== null) {
        process.env[name] = value;
        loaded++;
      }
    }

    console.info(`[vault] Loaded ${loaded} secrets from GCP Secret Manager`);
    return;
  }

  console.warn(`[vault] Unknown SECRETS_VAULT_PROVIDER: ${provider}`);
}

/**
 * Wrapper that loads vault secrets before running the callback.
 * Use in `instrumentation.ts` (Vercel) or the worker entrypoint.
 *
 * @example
 *   // apps/web/src/instrumentation.ts
 *   import { withVaultSecrets } from '@hamafx/shared/vault';
 *   export async function register() {
 *     await withVaultSecrets(async () => {
 *       // ... normal instrumentation
 *     });
 *   }
 */
export async function withVaultSecrets<T>(fn: () => Promise<T>): Promise<T> {
  await loadSecretsFromVault();
  return fn();
}

/**
 * Reset the idempotency guard. For tests only.
 */
export function _resetVaultLoader(): void {
  _vaultLoaded = false;
}
