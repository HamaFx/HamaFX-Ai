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

test.describe('Onboarding replay', () => {
  test('admin can reset onboarding from settings page', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await ensureTestUser('admin@example.com', 'password123', 'admin');
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');

    // Onboarding reset card is visible
    await expect(page.getByText('Reset and replay the onboarding wizard.')).toBeVisible();

    // Click reset and confirm
    page.on('dialog', (dialog) => {
      void dialog.accept();
    });

    await page.getByRole('button', { name: /reset onboarding/i }).click();

    // Should redirect to onboarding and render the wizard
    await expect(page).toHaveURL(/.*\/onboarding.*/, { timeout: 30_000 });
    await expect(page.getByText("Welcome to HamaFX-Ai")).toBeVisible();

    await context.close();
  });

  test('admin can reset onboarding from admin dashboard', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await ensureTestUser('admin@example.com', 'password123', 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin');

    // Onboarding tab is active by default
    await expect(page.getByText('Reset and replay the onboarding wizard.')).toBeVisible();

    page.on('dialog', (dialog) => {
      void dialog.accept();
    });

    await page.getByRole('button', { name: /reset onboarding/i }).click();

    // Should redirect to onboarding and render the wizard
    await expect(page).toHaveURL(/.*\/onboarding.*/, { timeout: 30_000 });
    await expect(page.getByText("Welcome to HamaFX-Ai")).toBeVisible();

    await context.close();
  });
});
