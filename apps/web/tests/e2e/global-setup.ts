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
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { loadE2eEnv } from './env-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default function globalSetup() {
  loadE2eEnv(__dirname);

  // Apply pending Drizzle migrations so the test database schema
  // matches the codebase (handles missing columns like
  // onboarding_progress added in migration 0034).
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (dbUrl) {
    try {
      execSync('pnpm --filter @hamafx/db exec drizzle-kit migrate', {
        cwd: resolve(__dirname, '../../../..'),
        stdio: 'pipe',
        timeout: 120_000,
      });
      // eslint-disable-next-line no-console
      console.log('[global-setup] Drizzle migrations applied');
    } catch (migrateErr) {
      // Non-fatal: log but don't fail — the user can run migrations
      // manually with: pnpm --filter @hamafx/db migrate:apply
      // eslint-disable-next-line no-console
      console.warn(
        '[global-setup] drizzle-kit migrate failed. Run manually:',
        migrateErr instanceof Error
          ? migrateErr.message.slice(0, 200)
          : String(migrateErr).slice(0, 200),
      );
    }
  }
}
