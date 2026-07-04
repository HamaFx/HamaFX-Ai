#!/usr/bin/env node
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

/**
 * scripts/predeploy-migrate.mjs
 *
 * Auto-applies pending Drizzle migrations against the production
 * database before the Vercel build. Idempotent — safe to run
 * multiple times; safe to skip when there are no pending migrations.
 *
 * Why this exists
 *   Vercel builds did NOT previously run `migrate:apply` automatically.
 *   If a schema change shipped in a commit without a manual migration
 *   run against prod, server components that read from the new tables
 *   failed at render time with `relation "<name>" does not exist`.
 *   See Vercel logs 2026-06-20 around 21:10 UTC for the trigger.
 *
 *   This script closes the gap: every prod deploy now applies
 *   pending migrations BEFORE next build runs. If the migration
 *   fails, the deploy fails — surfacing the error to the dev who
 *   pushed, not the user who hits the page.
 *
 * Behaviour
 *   - VERCEL_ENV === 'production'  : run migrate
 *   - VERCEL_ENV === 'preview'     : skip silently (preview
 *                                   deployments should not touch
 *                                   the production DB; if you want
 *                                   per-preview DBs, that's a
 *                                   separate setup with a separate
 *                                   DATABASE_URL)
 *   - Local (no VERCEL_ENV)        : run migrate (so `node
 *                                   scripts/predeploy-migrate.mjs`
 *                                   works as a manual one-liner too)
 *
 *   The "local runs migrations" branch is intentional: when running
 *   locally against the prod DB it acts like the manual one-liner
 *   `pnpm --filter @hamafx/db migrate:apply` from before, just with
 *   a friendlier wrapper.
 *
 * Env vars
 *   DIRECT_URL                 preferred — explicit direct/session connection
 *   POSTGRES_URL_NON_POOLING   compatibility fallback — direct connection
 *   DATABASE_URL               legacy fallback
 *
 * Wired into vercel.json buildCommand:
 *   "buildCommand": "node scripts/predeploy-migrate.mjs && npx turbo run build --filter=@hamafx/web"
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function redactUrl(url) {
  return url.replace(/:[^/@]+@/, ':***@');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Decision gate: preview builds do not migrate against prod.
const vercelEnv = process.env.VERCEL_ENV;
if (vercelEnv && vercelEnv !== 'production') {
  console.log(`[predeploy-migrate] VERCEL_ENV=${vercelEnv} — skipping migrations`);
  process.exit(0);
}

const envVars = [
  { name: 'DIRECT_URL', val: process.env.DIRECT_URL },
  { name: 'POSTGRES_URL_NON_POOLING', val: process.env.POSTGRES_URL_NON_POOLING },
  { name: 'DATABASE_URL', val: process.env.DATABASE_URL },
  { name: 'POSTGRES_URL', val: process.env.POSTGRES_URL },
];

let url = null;
let urlName = null;
for (const { name, val } of envVars) {
  if (val && val.length > 0) {
    url = val;
    urlName = name;
    break;
  }
}

if (!url) {
  const found = envVars.filter((e) => e.val && e.val.length > 0).map((e) => e.name);
  console.error(
    '[predeploy-migrate] No DB connection string found. Available env vars: ' +
      (found.length > 0 ? found.join(', ') : 'none') +
      '. Set DIRECT_URL or POSTGRES_URL_NON_POOLING before deploying to ensure DDL works.',
  );
  process.exit(1);
}

console.log('[predeploy-migrate] Using %s — %s', urlName, redactUrl(url));

if (urlName === 'DATABASE_URL' || urlName === 'POSTGRES_URL') {
  console.warn('[predeploy-migrate] WARNING: %s may be a pooled connection (e.g. PgBouncer).', urlName);
  console.warn('[predeploy-migrate] DDL through a pooler can fail or hang. Set DIRECT_URL or');
  console.warn('[predeploy-migrate] POSTGRES_URL_NON_POOLING for reliable migrations.');
}

// Sanity-check the migrations directory actually exists. If we
// ever move it, this fails loud rather than silently doing
// nothing useful.
const migrationsDir = resolve(repoRoot, 'packages/db/drizzle');
if (!existsSync(migrationsDir)) {
  console.error(
    `[predeploy-migrate] Migrations directory not found: ${migrationsDir}. ` +
      'Update the script or restore the directory.',
  );
  process.exit(1);
}

try {
  // Pass the connection string via DATABASE_URL — drizzle-kit reads
  // it from env (see packages/db/drizzle.config.ts). We use
  // execFileSync so the URL never appears in `ps` output.
  execFileSync('pnpm', ['--filter', '@hamafx/db', 'migrate:apply'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  console.log('[predeploy-migrate] OK — pending migrations applied');
} catch (err) {
  console.error('[predeploy-migrate] FAILED — migration step errored.');
  console.error('[predeploy-migrate] The build will not proceed. Fix the migration and re-deploy.');
  // Don't swallow the exit code.
  process.exit(1);
}
