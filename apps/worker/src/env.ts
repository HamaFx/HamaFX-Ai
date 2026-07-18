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
//
// Empty-string handling: when systemd's EnvironmentFile= loads
// `KEY=`, the value arrives as the literal empty string. zod's
// `.optional()` only short-circuits on `undefined`. We pre-process every
// optional-string field via `coerceEmptyToUndefined` so the operator
// can leave a row blank in `/opt/hamafx/.env` without tripping the
// .min(1) check.

import { z } from 'zod';

const coerceEmptyToUndefined = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional());
const optionalNonEmpty = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(1).optional(),
);

const WorkerEnvSchema = z.object({
  /** Either DATABASE_URL or POSTGRES_URL is required. */
  DATABASE_URL: optionalUrl,
  POSTGRES_URL: optionalUrl,

  /** Optional override; defaults to https://biquote.io in the consumer. */
  BIQUOTE_BASE_URL: optionalUrl,
  /** SignalR hub URL. Defaults to BiQuote's documented endpoint. */
  BIQUOTE_HUB_URL: z.string().url().default('https://biquote.io/hubs/tick'),

  /**
   * healthchecks.io UUIDs. Optional — when missing, healthchecks become
   * no-ops so local dev / tests work without configuration. Production
   * sets all of these via /opt/hamafx/.env.
   */
  HC_SIGNALR_UUID: optionalNonEmpty,
  HC_BACKUP_DB_UUID: optionalNonEmpty,
  HC_BACKUP_JOURNAL_UUID: optionalNonEmpty,
  HC_VERIFY_RESTORE_UUID: optionalNonEmpty,
  HC_UPDATE_UUID: optionalNonEmpty,
  // Per-job heartbeat UUIDs. Each migrated heavy job gets its own.
  HC_JOB_EMBEDDING_BACKFILL_UUID: optionalNonEmpty,
  HC_JOB_BRIEFINGS_UUID: optionalNonEmpty,
  HC_JOB_SNAPSHOTS_UUID: optionalNonEmpty,
  HC_JOB_COT_UUID: optionalNonEmpty,
  HC_JOB_FRED_ACTUALS_UUID: optionalNonEmpty,
  HC_JOB_WEEKLY_REVIEW_UUID: optionalNonEmpty,
  HC_JOB_RESONANCE_SYNC_UUID: optionalNonEmpty,
  HC_JOB_ALERTS_UUID: optionalNonEmpty,
  HC_DISK_CHECK_UUID: optionalNonEmpty,
  HC_TENANT_DELETE_UUID: optionalNonEmpty,
  HC_TENANT_EXPORT_UUID: optionalNonEmpty,
  HC_CLEANUP_UPLOADS_UUID: optionalNonEmpty,
  HC_DOCKER_PRUNE_UUID: optionalNonEmpty,

  /**
   * Optional Sentry DSN — server-only. When unset, the worker logs to
   * stderr but does not phone home. Wired in PR-18.
   */
  SENTRY_DSN: optionalUrl,

  /**
   * Deployed commit SHA, written by `update.sh` to /opt/hamafx/.deployed-sha.
   * The bootstrap script reads the file and exports it before exec.
   * Used as a Sentry tag and embedded in healthcheck POST bodies so we can
   * pinpoint a regression to a specific deploy.
   */
  DEPLOYED_SHA: coerceEmptyToUndefined.pipe(z.string().min(1).optional()).default('unknown'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  
  /** 
   * 'systemd' relies on external cron for jobs. 
   * 'docker' starts an internal node-cron scheduler.
   */
  WORKER_MODE: z.enum(['systemd', 'docker']).default('systemd'),

  /**
   * Comma-separated list of crypto symbols for the Binance WebSocket
   * consumer. Defaults to BTCUSDT,ETHUSDT.
   */
  BINANCE_CRYPTO_SYMBOLS: optionalNonEmpty,

  /**
   * Binance WebSocket base URL. Override to stream.binance.us for US-hosted
   * VMs since stream.binance.com blocks US IPs (HTTP 451).
   */
  BINANCE_WS_URL: optionalUrl,
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
    // PGlite mode: embedded Postgres, no remote DB URL needed.
    // The app uses getLocalDb() from @hamafx/db which falls back to PGlite.
    // We allow this in development; production always has a URL.
    if (result.data.NODE_ENV === 'production') {
      throw new Error('Either DATABASE_URL or POSTGRES_URL must be set in production');
    }
    console.warn('[worker] No DATABASE_URL set — using embedded PGlite for local development');
  }
  return result.data;
}

/** Resolve the active Postgres connection string, preferring DATABASE_URL. */
export function resolveDatabaseUrl(env: WorkerEnv): string {
  const url = env.DATABASE_URL || env.POSTGRES_URL;
  if (!url) throw new Error('Neither DATABASE_URL nor POSTGRES_URL is set');
  return url;
}
