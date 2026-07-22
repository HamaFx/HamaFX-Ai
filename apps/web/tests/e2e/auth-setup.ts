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
import { ensureSystemUser } from './test-utils';

const AUTH_FILE = 'tests/e2e/.auth/user.json';

setup('authenticate as test user', async ({ page }) => {
  // In legacy mode, middleware and chat pages use '__system__' as userId.
  // Create the DB row so FK constraints on threads/settings pass.
  await ensureSystemUser();

  // With AUTH_MODE=legacy, all auth checks are bypassed — navigate directly.
  await page.goto('/chat');
  await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

  // Save the authenticated state for downstream projects
  await page.context().storageState({ path: AUTH_FILE });
});
