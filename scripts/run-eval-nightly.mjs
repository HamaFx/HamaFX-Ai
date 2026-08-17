#!/usr/bin/env node

/**
 * Nightly eval wrapper (P0-1) — run the acceptance eval against a live app
 * and exit non-zero on any transport failure or assertion failure so a
 * scheduler (systemd timer / cron / CI) can page on regressions.
 *
 * The user has no GitHub Actions plan, so this is intentionally CI-free:
 * point a systemd timer or crontab at it on the VM.
 *
 * Env:
 *   EVAL_BASE_URL  (default http://localhost:3000)  App to POST to.
 *   EVAL_COOKIE    (required)  Auth cookie, e.g. "authjs.session-token=...".
 *   EVAL_OUT_DIR   (default artifacts/eval-nightly) Report output directory.
 *   EVAL_CASES     (default 1)  Use cases.json (with assertions) — set 0 to
 *                  use prompts.json (no assertions) instead.
 *   EVAL_TIMEOUT_MS (default 120000)  Per-prompt abort timeout.
 *
 * Usage:
 *   EVAL_COOKIE="authjs.session-token=..." node scripts/run-eval-nightly.mjs
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const baseUrl = process.env.EVAL_BASE_URL ?? 'http://localhost:3000';
const cookie = process.env.EVAL_COOKIE ?? '';
// Resolve to an absolute path — `pnpm --filter` runs with cwd set to the
// package directory, so a relative --out would land under packages/ai/.
const outDir = process.env.EVAL_OUT_DIR
  ? resolve(root, process.env.EVAL_OUT_DIR)
  : resolve(root, 'artifacts/eval-nightly');
const useCases = process.env.EVAL_CASES !== '0';
const timeoutMs = process.env.EVAL_TIMEOUT_MS ?? '120000';

if (!cookie) {
  process.stderr.write(
    'error: EVAL_COOKIE is required (e.g. EVAL_COOKIE="authjs.session-token=...").\n',
  );
  process.exit(2);
}

const args = [
  '--filter',
  '@kestrel/ai',
  'exec',
  'tsx',
  'src/eval/runner.ts',
  '--base-url',
  baseUrl,
  '--cookie',
  cookie,
  '--out',
  outDir,
  '--timeout',
  timeoutMs,
];
if (useCases) args.push('--cases');

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const result = spawnSync(pnpm, args, { cwd: root, stdio: 'inherit' });

const exitCode = result.error ? 1 : result.status ?? (result.signal ? 1 : 0);
process.exitCode = exitCode;
