// Worker environment validation.
//
// Phase 8 PR-5 starts minimal — DATABASE_URL and the optional health-check
// UUIDs the orchestration code already references. New env vars land in
// later PRs as the consumer / aggregator / job runner come online.
//
// We deliberately *don't* re-use `parseServerEnv` from `@hamafx/shared`
// because the worker is a different runtime — it doesn't need APP_PASSWORD,
// AUTH_COOKIE_SECRET, NEXT_PUBLIC_*, etc. Validating the smaller surface
// keeps boot fast and the failure modes clear.

import { z } from 'zod';

const WorkerEnvSchema = z.object({
  /** Either DATABASE_URL or POSTGRES_URL is required. */
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_URL: z.string().url().optional(),

  /** Optional override; defaults to https://biquote.io in the consumer. */
  BIQUOTE_BASE_URL: z.string().url().optional(),
  /** SignalR hub URL. Defaults to BiQuote's documented endpoint. */
  BIQUOTE_HUB_URL: z.string().url().default('https://biquote.io/hubs/tick'),

  /**
   * healthchecks.io UUIDs. Optional — when missing, healthchecks become
   * no-ops so local dev / tests work without configuration. Production
   * sets all of these via /opt/hamafx/.env.
   */
  HC_SIGNALR_UUID: z.string().min(1).optional(),
  HC_BACKUP_DB_UUID: z.string().min(1).optional(),
  HC_BACKUP_JOURNAL_UUID: z.string().min(1).optional(),
  HC_VERIFY_RESTORE_UUID: z.string().min(1).optional(),
  HC_UPDATE_UUID: z.string().min(1).optional(),

  /**
   * Optional Sentry DSN — server-only. When unset, the worker logs to
   * stderr but does not phone home. Wired in PR-18.
   */
  SENTRY_DSN: z.string().url().optional(),

  /**
   * Deployed commit SHA, written by `update.sh` to /opt/hamafx/.deployed-sha.
   * The bootstrap script reads the file and exports it before exec.
   * Used as a Sentry tag and embedded in healthcheck POST bodies so we can
   * pinpoint a regression to a specific deploy.
   */
  DEPLOYED_SHA: z.string().min(1).default('unknown'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

/**
 * Parse `process.env` (or an injected map for tests) into a typed worker
 * env. Throws a readable error listing every missing/invalid variable.
 *
 * Caller usage:
 *
 *     const env = loadEnv();
 *     // ...
 */
export function loadEnv(input: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = WorkerEnvSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid worker environment:\n${issues}`);
  }
  if (!result.data.DATABASE_URL && !result.data.POSTGRES_URL) {
    throw new Error('Either DATABASE_URL or POSTGRES_URL must be set for the worker');
  }
  return result.data;
}

/** Resolve the active Postgres connection string, preferring DATABASE_URL. */
export function resolveDatabaseUrl(env: WorkerEnv): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('Neither DATABASE_URL nor POSTGRES_URL is set');
  return url;
}
