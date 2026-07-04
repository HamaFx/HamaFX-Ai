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
// E2E: Responsive layout
//
// Verifies that key pages render correctly at mobile and desktop viewports.
// Run on mobile-chrome and mobile-safari projects in addition to desktop.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Responsive layout', () => {
  test('chat page is usable on mobile viewport', async ({ authedPage }) => {
    const page = authedPage;

    // Verify the textarea is visible and usable
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    // The textarea should be within the viewport (not off-screen)
    const box = await textarea.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 500);
    }
  });

  test('settings page is usable on mobile viewport', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/settings/profile');

    await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible({ timeout: 15_000 });

    // Form inputs should be visible and not overflow
    const nameInput = page.getByLabel(/name/i);
    await expect(nameInput).toBeVisible();

    const box = await nameInput.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 500);
    }
  });

  test('dashboard renders without horizontal scroll on mobile', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/dashboard');

    // Check that the page doesn't have horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // Allow a small tolerance for sub-pixel rounding
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('journal page renders without horizontal scroll on mobile', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/journal');

    await expect(page.getByRole('heading', { name: /journal/i })).toBeVisible({ timeout: 15_000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('no horizontal scroll on key pages at mobile viewport', async ({ authedPage }) => {
    const page = authedPage;

    const pages = ['/chat', '/dashboard', '/journal', '/alerts', '/signals', '/news', '/calendar'];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => {});

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      // Allow 2px tolerance for sub-pixel rounding
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
    }
  });
});
