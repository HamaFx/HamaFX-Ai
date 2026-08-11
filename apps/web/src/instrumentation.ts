import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Phase 3 §3.9 — load secrets from vault (GCP Secret Manager) before
  // anything else runs. No-op when SECRETS_VAULT_PROVIDER is unset or 'none'.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadSecretsFromVault } = await import('@kestrel/shared/vault');
    await loadSecretsFromVault();
    // Fail closed during the Node server startup path as well as in
    // request callbacks. Vault loading must happen first because it may
    // provide AUTH_SECRET for managed deployments.
    const { assertProductionSecurity } = await import('./auth.config');
    assertProductionSecurity();
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
