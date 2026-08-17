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

import { expect, test } from '@playwright/test';

import { authenticateAs } from './test-utils';

test.describe('Onboarding replay', () => {
  test('admin can reset onboarding from settings page', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    });
    const page = await context.newPage();

    await authenticateAs(page, 'admin@example.com', 'password123', 'admin');
    await page.goto('/settings');
    await expect(page).toHaveURL('/settings');

    // Onboarding reset card is visible
    await expect(page.getByText('Reset and replay the onboarding wizard.')).toBeVisible();

    // The reset uses the app's ConfirmDrawer, not a native dialog. Open it and
    // confirm via its "Reset" button.
    await page.getByRole('button', { name: /reset onboarding/i }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();

    // Should redirect to onboarding and render the wizard
    await expect(page).toHaveURL(/.*\/onboarding.*/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Welcome to Kestrel' })).toBeVisible();

    await context.close();
  });

  test('admin can reset onboarding from admin dashboard', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    });
    const page = await context.newPage();

    await authenticateAs(page, 'admin@example.com', 'password123', 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL('/admin');

    // The admin dashboard defaults to the Health tab. Activate Onboarding
    // explicitly and wait for the inspector to load the current user.
    await page.getByRole('tab', { name: 'Onboarding' }).click();
    await expect(page.getByRole('button', { name: /reset onboarding/i })).toBeVisible();

    // Confirm via the app's ConfirmDrawer, not a native dialog.
    await page.getByRole('button', { name: /reset onboarding/i }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();

    // Should redirect to onboarding and render the wizard
    await expect(page).toHaveURL(/.*\/onboarding.*/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Welcome to Kestrel' })).toBeVisible();

    await context.close();
  });
});
