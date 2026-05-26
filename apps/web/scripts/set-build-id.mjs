#!/usr/bin/env node
// @ts-check
/**
 * set-build-id.mjs
 *
 * Prebuild step. Computes a deterministic-per-deploy build id from the git
 * short SHA (or `$VERCEL_GIT_COMMIT_SHA` / `$GITHUB_SHA` when available) and
 * an epoch-seconds suffix, then publishes it two ways:
 *
 *   1. Writes `apps/web/.build-id` — a single-line text file consumed by
 *      `generate-sw.mjs` (postbuild) when `process.env.NEXT_PUBLIC_BUILD_ID`
 *      is not propagated.
 *   2. Upserts `NEXT_PUBLIC_BUILD_ID=<value>` into `apps/web/.env.production.local`
 *      so `next build` picks it up as a public env var and the running app
 *      can ship the same id to the service worker.
 *
 * Both files are gitignored; the script is idempotent and safe to re-run.
 *
 * Requirements: 5.5, 5.6
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const BUILD_ID_FILE = resolve(WEB_ROOT, '.build-id');
const ENV_FILE = resolve(WEB_ROOT, '.env.production.local');
const ENV_KEY = 'NEXT_PUBLIC_BUILD_ID';

/**
 * Best-effort short git SHA. Falls back to a 7-char random hex when git is
 * unavailable (e.g. in a stripped Docker layer) so the script never fails
 * the build.
 *
 * @returns {string} 7-char lowercase hex
 */
function resolveGitSha() {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.GIT_COMMIT_SHA;
  if (fromEnv && /^[0-9a-f]{7,}$/i.test(fromEnv)) {
    return fromEnv.slice(0, 7).toLowerCase();
  }
  try {
    const sha = execSync('git rev-parse --short=7 HEAD', {
      cwd: WEB_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (/^[0-9a-f]{7,}$/i.test(sha)) return sha.slice(0, 7).toLowerCase();
  } catch {
    /* fall through to random */
  }
  // 7-char hex; collision-resistant enough for cache-bust purposes.
  return Math.floor(Math.random() * 0xfffffff)
    .toString(16)
    .padStart(7, '0');
}

/**
 * Upsert `KEY=value` in a dotenv-style file, preserving every other line.
 *
 * @param {string} path
 * @param {string} key
 * @param {string} value
 */
function upsertEnvLine(path, key, value) {
  const line = `${key}=${value}`;
  if (!existsSync(path)) {
    writeFileSync(path, `${line}\n`, 'utf8');
    return;
  }
  const current = readFileSync(path, 'utf8');
  const lines = current.split(/\r?\n/);
  const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
  const idx = lines.findIndex((l) => keyPattern.test(l));
  if (idx === -1) {
    // Append, ensuring file ends with newline.
    const sep = current.endsWith('\n') || current.length === 0 ? '' : '\n';
    writeFileSync(path, `${current}${sep}${line}\n`, 'utf8');
    return;
  }
  lines[idx] = line;
  writeFileSync(path, lines.join('\n'), 'utf8');
}

function main() {
  const sha = resolveGitSha();
  const epoch = Math.floor(Date.now() / 1000);
  const buildId = `${sha}-${epoch}`;

  writeFileSync(BUILD_ID_FILE, `${buildId}\n`, 'utf8');
  upsertEnvLine(ENV_FILE, ENV_KEY, buildId);

  // eslint-disable-next-line no-console
  console.log(`[set-build-id] ${ENV_KEY}=${buildId}`);
}

main();
