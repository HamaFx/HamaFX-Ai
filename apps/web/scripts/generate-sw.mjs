#!/usr/bin/env node
// @ts-check
/**
 * generate-sw.mjs
 *
 * Postbuild step. Stamps the service worker with the current build id and
 * writes the precache manifest consumed by the SW's `install` handler.
 *
 * Inputs (in order of preference):
 *   1. `process.env.NEXT_PUBLIC_BUILD_ID`
 *   2. `apps/web/.build-id` (written by `set-build-id.mjs`)
 *   3. `<epoch>` fallback (logged as a warning)
 *
 * Outputs:
 *   - `apps/web/public/sw.js`              — `__BUILD_ID__` substituted
 *   - `apps/web/public/sw-precache.json`   — precache list from design §6
 *
 * The SW source template lives at `apps/web/scripts/sw.template.js`.
 *
 * Requirements: 5.5, 5.6, 5.7
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
export const TEMPLATE_FILE = resolve(WEB_ROOT, 'scripts/sw.template.js');
export const SW_OUT_FILE = resolve(WEB_ROOT, 'public/sw.js');
export const PRECACHE_OUT_FILE = resolve(WEB_ROOT, 'public/sw-precache.json');
export const BUILD_ID_FILE = resolve(WEB_ROOT, '.build-id');

/**
 * Precache list — exact URLs only (SW cache.addAll requires exact matches,
 * not globs). Runtime caching via the SW fetch handler covers the
 * fingerprinted JS/CSS bundles dynamically.
 */
export const PRECACHE_URLS = Object.freeze([
  '/chat',
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/favicon.ico',
  '/manifest.webmanifest',
]);

/**
 * Resolve the build id from env → .build-id → epoch fallback.
 *
 * @returns {string}
 */
export function resolveBuildId() {
  const fromEnv = process.env.NEXT_PUBLIC_BUILD_ID;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  if (existsSync(BUILD_ID_FILE)) {
    const fromFile = readFileSync(BUILD_ID_FILE, 'utf8').trim();
    if (fromFile.length > 0) return fromFile;
  }

  const epoch = String(Math.floor(Date.now() / 1000));
  // eslint-disable-next-line no-console
  console.warn(
    `[generate-sw] No NEXT_PUBLIC_BUILD_ID or .build-id found; falling back to epoch=${epoch}`,
  );
  return epoch;
}

export function main() {
  const buildId = resolveBuildId();

  mkdirSync(dirname(PRECACHE_OUT_FILE), { recursive: true });
  writeFileSync(
    PRECACHE_OUT_FILE,
    `${JSON.stringify(PRECACHE_URLS, null, 2)}\n`,
    'utf8',
  );
  // eslint-disable-next-line no-console
  console.log(
    `[generate-sw] wrote ${PRECACHE_OUT_FILE} (${PRECACHE_URLS.length} urls)`,
  );

  if (!existsSync(TEMPLATE_FILE)) {
    // eslint-disable-next-line no-console
    console.error(
      `[generate-sw] template not found at ${TEMPLATE_FILE}. ` +
        `Service worker cannot be generated; failing the build.`,
    );
    process.exit(1);
  }

  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  const stamped = template.replace(/__BUILD_ID__/g, buildId);
  writeFileSync(SW_OUT_FILE, stamped, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[generate-sw] wrote ${SW_OUT_FILE} (build id: ${buildId})`);
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  main();
}
