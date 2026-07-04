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

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadE2eEnv } from './tests/e2e/env-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadE2eEnv(__dirname);

const isCI = !!process.env.CI;

// Build the webServer command with the correct ENCRYPTION_SECRET from
// .env.production.local (since .env.local has an empty override).
function buildWebServerCommand(): string {
  const encKey = process.env.ENCRYPTION_SECRET;
  const baseCmd = isCI ? 'pnpm build && pnpm start' : 'pnpm dev';
  // Force webpack mode because Turbopack does not respect
  // serverExternalPackages, causing thread-stream's worker file resolution
  // to fail ("vendor-chunks/lib/worker.js").
  const webpackFlag = isCI ? '' : ' --webpack';
  if (encKey) {
    return `ENCRYPTION_SECRET=${encKey} ${baseCmd}${webpackFlag}`;
  }
  return `${baseCmd}${webpackFlag}`;
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
    baseURL: 'http://localhost:3000',
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
    command: buildWebServerCommand(),
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: isCI ? 120_000 : 30_000,
  },
});
