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

// SEC-1: Matcher-coverage test — ensure every withAuth-protected route
// is covered by the middleware matcher regex.
//
// Enumerates all route.ts files under apps/web/src/app/ that import
// withAuth, derives the URL path, and asserts each is matched by the
// middleware matcher regex.
//
// NOTE: The regex below must stay in sync with middleware.ts. If you
// update the matcher exclusions, update this test too.

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

const WEB_DIR = join(import.meta.dirname, '..', 'src');

/**
 * The middleware matcher regex from middleware.ts.
 * Next.js applies this against the pathname WITHOUT a leading `/`.
 * Keep in sync with middleware.ts `config.matcher`.
 */
const MATCHER_REGEX =
  /^((?!auth|share|api\/auth|api\/dev|api\/cron|api\/telegram|api\/billing\/webhook|debug|sw\.js|sw-precache\.json|_next\/static|_next\/image|favicon\.ico|manifest\.webmanifest|icons|robots\.txt|sitemap\.xml).)*$/;

/** Exclusion prefixes — routes intentionally NOT covered by middleware. */
const EXCLUDED_PREFIXES = [
  'auth', 'share', 'api/auth', 'api/dev', 'api/cron', 'api/telegram',
  'api/billing/webhook', 'debug', 'sw.js', 'sw-precache.json',
  '_next/static', '_next/image', 'favicon.ico', 'manifest.webmanifest',
  'icons', 'robots.txt', 'sitemap.xml',
];

/** Find all route.ts files recursively. */
function findRouteFiles(dir: string): string[] {
  const result: string[] = [];
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      result.push(...findRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      result.push(full);
    }
  }
  return result;
}

/** Check if a source file imports withAuth. */
function importsWithAuth(filePath: string): boolean {
  try {
    const src = readFileSync(filePath, 'utf-8');
    return /\bwithAuth\b/.test(src);
  } catch {
    return false;
  }
}

/** Map route.ts path to URL path. */
function filePathToUrlPath(filePath: string): string {
  const rel = relative(WEB_DIR, filePath);
  let urlPath = rel
    .replace(/^app\//, '/')
    .replace(/\/route\.tsx?$/, '');
  urlPath = urlPath.replace(/\/\([^)]+\)/g, ''); // remove group segments
  urlPath = urlPath.replace(/\/+/g, '/');
  return urlPath;
}

describe('middleware matcher coverage (SEC-1)', () => {
  const appDir = join(WEB_DIR, 'app');
  const allRoutes = findRouteFiles(appDir);
  const protectedRoutes = allRoutes.filter(importsWithAuth);

  it('finds at least some protected routes (sanity check)', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
  });

  for (const routeFile of protectedRoutes) {
    const urlPath = filePathToUrlPath(routeFile);
    const pathNoSlash = urlPath.replace(/^\//, '');
    const isExcluded = EXCLUDED_PREFIXES.some(
      (p) => pathNoSlash === p || pathNoSlash.startsWith(p + '/'),
    );

    if (isExcluded) continue;

    it(`matcher covers ${urlPath}`, () => {
      expect(
        MATCHER_REGEX.test(pathNoSlash),
        `Route "${urlPath}" is NOT covered by middleware matcher. ` +
          `Update middleware.ts config.matcher or add an exclusion.`,
      ).toBe(true);
    });
  }
});
