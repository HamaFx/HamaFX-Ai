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

import { readFileSync } from 'fs';
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnvFiles() {
  const files = [
    resolve(__dirname, '.env.local'),
    resolve(__dirname, '../../.env.local'),
  ];
  for (const envPath of files) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        if (trimmed.slice(eqIdx + 1).trim() === '"') continue; // skip multi-line JSON start
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {}
  }
  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.AUTH_COOKIE_SECRET || 'e2e-test-fallback-secret-key-32-chars!!';
  }
  if (!process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  }
  if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
    process.env.DATABASE_URL = process.env.POSTGRES_URL;
  }
}

loadEnvFiles();

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
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 120_000 : 30_000,
  },
});
