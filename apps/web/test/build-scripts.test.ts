// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const buildIdFile = resolve(process.cwd(), '.build-id');
const envFile = resolve(process.cwd(), '.env.production.local');
const swFile = resolve(process.cwd(), 'public/sw.js');
const precacheFile = resolve(process.cwd(), 'public/sw-precache.json');

describe('build scripts', () => {
  let originalSw: Buffer | null = null;

  beforeAll(() => {
    if (existsSync(swFile)) {
      originalSw = readFileSync(swFile);
    }
  });

  afterAll(() => {
    for (const f of [buildIdFile, envFile]) {
      try {
        if (existsSync(f)) unlinkSync(f);
      } catch {
        // ignore
      }
    }
    if (originalSw) {
      // Restore the committed service worker; the test overwrote it.
      try {
        execSync('git checkout -- public/sw.js public/sw-precache.json', { cwd: process.cwd() });
      } catch {
        // Not a git checkout or file not tracked — best effort.
      }
    }
  });

  it('set-build-id writes .build-id and .env.production.local', () => {
    execSync('node scripts/set-build-id.mjs', { cwd: process.cwd() });

    expect(existsSync(buildIdFile)).toBe(true);
    const buildId = readFileSync(buildIdFile, 'utf8').trim();
    expect(buildId).toMatch(/^[0-9a-f]{7}-\d+$/);

    expect(existsSync(envFile)).toBe(true);
    expect(readFileSync(envFile, 'utf8')).toContain(`NEXT_PUBLIC_BUILD_ID=${buildId}`);
  });

  it('generate-sw writes precache manifest and stamps sw.js with the build id', () => {
    execSync('node scripts/generate-sw.mjs', { cwd: process.cwd() });

    const buildId = readFileSync(buildIdFile, 'utf8').trim();

    expect(existsSync(precacheFile)).toBe(true);
    const precache = JSON.parse(readFileSync(precacheFile, 'utf8')) as unknown[];
    expect(precache).toContain('/chat');

    expect(existsSync(swFile)).toBe(true);
    const sw = readFileSync(swFile, 'utf8');
    expect(sw).toContain(`hamafx-shell-v${buildId}`);
  });

  it('generate-sw fails the build when the template is missing', () => {
    const templateFile = resolve(process.cwd(), 'scripts/sw.template.js');
    const backup = `${templateFile}.bak`;
    renameSync(templateFile, backup);

    try {
      expect(() =>
        execSync('node scripts/generate-sw.mjs', { cwd: process.cwd() }),
      ).toThrow();
    } finally {
      renameSync(backup, templateFile);
    }
  });
});
