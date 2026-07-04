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
// E2E: Dashboard
//
// Verifies that the dashboard page loads and renders its widgets.
// The dashboard uses Promise.allSettled so individual widget failures
// should not break the page.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Dashboard', () => {
  test('dashboard page loads without errors', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/dashboard');

    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page).not.toHaveURL(/.*\/login/);

    // Page should render — no application error
    await expect(page.getByText(/application error/i)).not.toBeVisible();
  });

  test('dashboard renders main content area', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/dashboard');

    // The main content area should be present
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard widgets handle empty/loading states gracefully', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/dashboard');

    // The page should not crash even if some data sources fail.
    // Check that the page body is visible and has content.
    await expect(page.locator('body')).toBeVisible();

    // No unhandled error pages
    await expect(page.getByText(/application error/i)).not.toBeVisible();
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });
});
