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
// E2E test env bootstrap — runs in the main process BEFORE workers fork,
// so process.env mutations are reliably inherited by all test workers.
// Next.js auto-loads .env.local for the webServer; this makes the same
// vars available to the Playwright test runner process.
// ---------------------------------------------------------------------------

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadE2eEnv } from './tests/e2e/env-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadE2eEnv(__dirname);

// Build the webServer command with the correct ENCRYPTION_SECRET from
// .env.production.local (since .env.local has an empty override).
function buildWebServerCommand(): string {
  const encKey = process.env.ENCRYPTION_SECRET;
  const baseCmd = process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev';
  // Force webpack mode because Turbopack does not respect
  // serverExternalPackages, causing thread-stream's worker file resolution
  // to fail ("vendor-chunks/lib/worker.js").
  const webpackFlag = process.env.CI ? '' : ' --webpack';
  if (encKey) {
    return `ENCRYPTION_SECRET=${encKey} ${baseCmd}${webpackFlag}`;
  }
  return `${baseCmd}${webpackFlag}`;
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: buildWebServerCommand(),
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 30_000,
  },
});
