#!/usr/bin/env node
// @ts-check

/**
 * Build wrapper for the web app.
 *
 * Next.js may remove generated dotenv files and trace the temporary
 * `.build-id` file while producing the standalone output. Generate the id
 * once, pass it explicitly to both child processes, and remove the temporary
 * handoff files before Next starts so standalone tracing stays clean.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_ID_FILE = resolve(WEB_ROOT, '.build-id');
const ENV_FILE = resolve(WEB_ROOT, '.env.production.local');

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command, args, env = process.env) {
  execFileSync(command, args, {
    cwd: WEB_ROOT,
    env,
    stdio: 'inherit',
  });
}

run(process.execPath, ['scripts/set-build-id.mjs']);

if (!existsSync(BUILD_ID_FILE)) {
  throw new Error('[build] set-build-id did not create .build-id');
}

const buildId = readFileSync(BUILD_ID_FILE, 'utf8').trim();
if (!buildId) {
  throw new Error('[build] generated build id is empty');
}

const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_BUILD_ID: buildId,
};

// The build-id file is only a build-time handoff mechanism. Leaving it in
// the app root makes Next's standalone file tracer try to copy it as a
// runtime dependency, which creates a noisy ENOENT during build cleanup.
// Keep the dotenv file available for Next's environment loading; it is
// removed by Next's build cleanup when appropriate and is never deleted by
// this wrapper (it may contain other local configuration).
for (const file of [BUILD_ID_FILE]) {
  try {
    unlinkSync(file);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      continue;
    }
    throw error;
  }
}

run(pnpm, ['exec', 'next', 'build'], buildEnv);
run(process.execPath, ['scripts/generate-sw.mjs'], buildEnv);

// eslint-disable-next-line no-console
console.log(`[build] completed with build id ${buildId}`);
