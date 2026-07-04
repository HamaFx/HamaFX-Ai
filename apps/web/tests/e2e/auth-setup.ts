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
// Auth setup project — runs once before all other projects.
//
// Logs in as the default test user and saves the authenticated session
// (cookies + localStorage) to .auth/user.json. All downstream projects
// load this via storageState, eliminating per-test login boilerplate.
//
// This file is matched by the 'setup' project in playwright.config.ts.
// ---------------------------------------------------------------------------

import { test as setup, expect } from '@playwright/test';
import { ensureTestUser } from './test-utils';

const AUTH_FILE = 'tests/e2e/.auth/user.json';

setup('authenticate as test user', async ({ page }) => {
  // Ensure the test user exists in the database
  await ensureTestUser('test@example.com', 'password123');

  // Navigate to login and authenticate
  await page.goto('/login');

  // Use modern locators: getByLabel aligns with the <label htmlFor> in the form
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to the chat page
  await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

  // Save the authenticated state for downstream projects
  await page.context().storageState({ path: AUTH_FILE });
});
