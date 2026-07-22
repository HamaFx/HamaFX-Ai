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

import { test, expect } from '@playwright/test';
// With AUTH_MODE=legacy, all auth checks are bypassed — no authenticateAs needed.
import { ensureTestUser } from './test-utils';

test.describe('Admin dashboard', () => {
  test('loads for admin users', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await ensureTestUser('admin@example.com', 'password123', 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin');

    // Admin page renders the tab navigation
    await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Onboarding' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Features' })).toBeVisible();

    await context.close();
  });

  test('switches between admin tabs', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await ensureTestUser('admin@example.com', 'password123', 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin');

    // Switch to Users tab
    await page.getByRole('button', { name: 'Users' }).click();
    await expect(page.getByText('Total:')).toBeVisible();

    // Switch to Features tab
    await page.getByRole('button', { name: 'Features' }).click();
    await expect(page.getByText('No feature flag configured.')).toBeVisible();

    await context.close();
  });

  test('redirects non-admin users to login', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await ensureTestUser('regular@example.com', 'password123', 'user');

    await page.goto('/admin');

    // Non-admin should be redirected away from /admin
    await expect(page).toHaveURL(/^(?!.*\/admin).*$/, { timeout: 10_000 });

    await context.close();
  });
});
