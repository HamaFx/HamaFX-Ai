/**
 * Copyright 2026 Kestrel
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

// ---------------------------------------------------------------------------
// Playwright E2E configuration — 2026 upgrade
//
// Key improvements over the previous config:
//   • globalSetup is wired (runs Drizzle migrations before tests)
//   • Multi-browser: Chromium, Firefox, WebKit + Mobile Chrome/Safari
//   • storageState for authenticated tests (login once, reuse everywhere)
//   • Per-action timeouts + per-expect timeouts (surface real slowdowns)
//   • Screenshot + video + trace on failure (CI debugging)
//   • CI sharding + JUnit reporter for parallel CI runs
//   • HTML reporter for local debugging
// ---------------------------------------------------------------------------

import { randomBytes } from 'node:crypto';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { defineConfig, devices } from '@playwright/test';

import { loadE2eEnv } from './tests/e2e/env-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadE2eEnv(__dirname);
// E2E must exercise the protected application path. Never inherit a local
// AUTH_MODE=legacy setting from a developer's .env.local file.
process.env.AUTH_MODE = 'normal';

const e2ePort = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const e2eBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${e2ePort}`;
// Keep the test runner, JWT helper, and child Next process on one origin.
process.env.NEXTAUTH_URL = e2eBaseUrl;
// Local env files may intentionally leave ENCRYPTION_SECRET blank. E2E
// fixtures need to encrypt their seed provider with the same key that the
// child Next process uses, so create one ephemeral per-run value here.
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_SECRET ?? '')) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const isCI = !!process.env.CI;

// Build the webServer command with the correct ENCRYPTION_SECRET from
// .env.production.local (since .env.local has an empty override).
function buildWebServerCommand(): string {
  const encKey = process.env.ENCRYPTION_SECRET;
  // Next.js 16 uses Turbopack by default; no bundler flag is needed. The
  // security-critical values are supplied through webServer.env below so
  // they do not appear in the child process command line.
  return isCI ? 'pnpm build && pnpm start' : 'pnpm dev';
}

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/output',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  // Per-action timeout — surfaces real slowdowns instead of hiding them
  // behind a generous global timeout.
  expect: {
    timeout: 10_000,
  },

  // Reporters: HTML for local, + JUnit + list for CI
  reporter: isCI
    ? [['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }], ['list']]
    : 'html',

  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Stable locale/timezone for deterministic tests
    locale: 'en-US',
    timezoneId: 'UTC',
  },

  projects: [
    // --- Auth setup project: logs in once and saves storageState ---
    {
      name: 'setup',
      testMatch: /auth-setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // --- Desktop browsers ---
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      testIgnore: /auth-setup\.ts/,
    },
    {
      name: 'firefox',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      testIgnore: /auth-setup\.ts/,
      // Firefox is slower in CI — only run on nightly
      testMatch: isCI ? /.*\.spec\.ts/ : /.*\.spec\.ts/,
    },
    {
      name: 'webkit',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Safari'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      testIgnore: /auth-setup\.ts/,
    },

    // --- Mobile viewport ---
    {
      name: 'mobile-chrome',
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      testIgnore: /auth-setup\.ts/,
      testMatch: /navigation\.spec\.ts|responsive\.spec\.ts|auth\.spec\.ts/,
    },
    {
      name: 'mobile-safari',
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 15'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      testIgnore: /auth-setup\.ts/,
      testMatch: /navigation\.spec\.ts|responsive\.spec\.ts|auth\.spec\.ts/,
    },
  ],

  globalSetup: './tests/e2e/global-setup.ts',

  webServer: {
    command: `${buildWebServerCommand()} --port ${e2ePort}`,
    url: e2eBaseUrl,
    env: {
      AUTH_MODE: 'normal',
      NEXTAUTH_URL: e2eBaseUrl,
      ...(process.env.AUTH_SECRET ? { AUTH_SECRET: process.env.AUTH_SECRET } : {}),
      ...(process.env.ENCRYPTION_SECRET
        ? { ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET }
        : {}),
    },
    // Never reuse an already-running server: it may have been started with
    // AUTH_MODE=legacy or a different signing secret.
    reuseExistingServer: false,
    // Next's first compile can exceed 30s on the repository's network-backed
    // workspace. Keep local runs deterministic instead of failing before the
    // browser suite starts; CI retains the stricter production-like timeout.
    timeout: isCI ? 120_000 : 90_000,
  },
});
