import * as Sentry from '@sentry/nextjs';

export async function register() {
  // Phase 3 §3.9 — load secrets from vault (GCP Secret Manager) before
  // anything else runs. No-op when SECRETS_VAULT_PROVIDER is unset or 'none'.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { loadSecretsFromVault } = await import('@hamafx/shared/vault');
    await loadSecretsFromVault();
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
