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
 * The SW source template lives at `apps/web/scripts/sw.template.js` and is
 * authored in task 13.2. While that file does not yet exist, this script
 * logs a warning and only writes the precache manifest, so `next build`
 * succeeds end-to-end before 13.2 lands.
 *
 * Requirements: 5.5, 5.6, 5.7
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const TEMPLATE_FILE = resolve(WEB_ROOT, 'scripts/sw.template.js');
const SW_OUT_FILE = resolve(WEB_ROOT, 'public/sw.js');
const PRECACHE_OUT_FILE = resolve(WEB_ROOT, 'public/sw-precache.json');
const BUILD_ID_FILE = resolve(WEB_ROOT, '.build-id');

/**
 * Precache list — must match design §6 exactly. The SW's `install` handler
 * fetches this file and `addAll`s its contents.
 *
 * `/` is intentionally absent because it redirects to `/chat`; `/chat` is
 * precached directly so the offline shell renders without a redirect chain.
 */
// L8: Precache list is intentionally small — exact URLs only (SW cache.addAll
// requires exact matches, not globs). Runtime caching via the SW fetch handler
// covers the fingerprinted JS/CSS bundles dynamically.
const PRECACHE_URLS = Object.freeze([
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
function resolveBuildId() {
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

function main() {
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
    console.warn(
      `[generate-sw] template not found at ${TEMPLATE_FILE}; skipping public/sw.js. ` +
        `(Will be generated once task 13.2 lands the template.)`,
    );
    return;
  }

  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  const stamped = template.replace(/__BUILD_ID__/g, buildId);
  writeFileSync(SW_OUT_FILE, stamped, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[generate-sw] wrote ${SW_OUT_FILE} (build id: ${buildId})`);
}

main();
