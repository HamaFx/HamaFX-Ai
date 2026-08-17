/**
 * Playwright global setup — loads environment variables from .env.local
 * so that getDb() and other modules can connect during E2E tests.
 *
 * Next.js auto-loads .env.local for the dev server (via webServer),
 * but the Playwright test runner process does not. This bridge ensures
 * the test runner sees the same env as the dev server.
 *
 * Also applies pending Drizzle migrations so the test database schema
 * stays in sync with the codebase (e.g. onboarding_progress column).
 *
 * Migration failures FAIL CLOSED (abort the run) so a stale schema can
 * never silently pass E2E. Local development can opt out with
 * `E2E_ALLOW_STALE_SCHEMA=1`, which is intended only for environments
 * where the direct migration connection is unreachable and the operator
 * has independently verified the schema is current.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { loadE2eEnv } from './env-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function globalSetup() {
  loadE2eEnv(__dirname);

  // Mirror drizzle.config.ts URL precedence: prefer a direct connection
  // (DDL-safe), fall back to the pooler, then skip entirely for PGlite runs
  // (the embedded database bootstraps its own schema).
  const dbUrl =
    process.env.DIRECT_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;

  if (!dbUrl) {
    // PGlite local run — no external DB to migrate.
    // eslint-disable-next-line no-console
    console.log('[global-setup] no external database URL — skipping drizzle migrations (PGlite)');
    return;
  }

  try {
    execSync('pnpm --filter @kestrel/db exec drizzle-kit migrate', {
      cwd: resolve(__dirname, '../../../..'),
      stdio: 'pipe',
      timeout: 120_000,
    });
    // eslint-disable-next-line no-console
    console.log('[global-setup] Drizzle migrations applied');
  } catch (migrateErr) {
    const stderr = readStderr(migrateErr);
    const message = readMessage(migrateErr);
    const detail = [message, stderr].filter(Boolean).join('\n');

    if (process.env.E2E_ALLOW_STALE_SCHEMA === '1') {
      // Explicit local escape hatch — the operator asserts the schema is
      // current and merely needs to bypass an unreachable migration channel.
      // eslint-disable-next-line no-console
      console.warn(
        `[global-setup] migrations failed but E2E_ALLOW_STALE_SCHEMA=1 is set — proceeding against a possibly-stale schema.\n${detail}`,
      );
      return;
    }

    throw new Error(
      `[global-setup] drizzle-kit migrate failed; refusing to run E2E against a possibly-stale schema.\n` +
        `Run \`pnpm --filter @kestrel/db migrate:apply\` manually, or set E2E_ALLOW_STALE_SCHEMA=1 to override (local development only).\n${detail}`,
    );
  }
}

function readMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * execSync attaches the child stderr to the thrown error object rather than
 * to `message`, so surface it explicitly — otherwise the operator only sees
 * "Command failed: pnpm ..." and cannot diagnose the real cause.
 */
function readStderr(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === 'string' && stderr.trim().length > 0) {
      return stderr.trim();
    }
  }
  return '';
}
