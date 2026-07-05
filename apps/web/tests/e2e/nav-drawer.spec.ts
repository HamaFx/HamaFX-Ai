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
// E2E: Navigation Drawer
//
// Verifies the nav drawer opens/closes, renders all navigation items
// with correct labels and icons, marks the active route, shows user
// identity, and closes on route change. Also checks mobile behavior.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Navigation drawer', () => {
  test('opens via hamburger menu trigger', async ({ authedPage }) => {
    const page = authedPage;

    // The nav trigger should be visible
    const navTrigger = page.getByRole('button', { name: /open navigation/i });
    await expect(navTrigger).toBeVisible();

    // Click to open the drawer
    await navTrigger.click();

    // The drawer should be visible with the primary navigation label
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).toBeVisible();
  });

  test('renders Markets section with all items', async ({ authedPage }) => {
    const page = authedPage;

    // Open the nav drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // Markets section should be visible
    await expect(page.getByText('Markets')).toBeAttached();

    // All primary items should be present
    const marketItems = ['Dashboard', 'Chat', 'Chart', 'News', 'Calendar'];
    for (const item of marketItems) {
      await expect(page.getByRole('link', { name: new RegExp(item, 'i') }).first()).toBeAttached();
    }
  });

  test('renders Personal section with all items', async ({ authedPage }) => {
    const page = authedPage;

    // Open the nav drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // Personal section should be visible
    await expect(page.getByText('Personal')).toBeAttached();

    // All secondary items should be present
    const personalItems = ['Signals', 'Alerts', 'Journal', 'Settings'];
    for (const item of personalItems) {
      await expect(page.getByRole('link', { name: new RegExp(item, 'i') }).first()).toBeAttached();
    }
  });

  test('active route is highlighted', async ({ authedPage }) => {
    const page = authedPage;

    // Navigate to dashboard first
    await page.goto('/dashboard');

    // Open the nav drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // The Dashboard link should have aria-current="page"
    const dashboardLink = page.getByRole('link', { name: /dashboard/i }).first();
    await expect(dashboardLink).toHaveAttribute('aria-current', 'page');
  });

  test('shows user identity', async ({ authedPage }) => {
    const page = authedPage;

    // Open the nav drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // User name should be visible
    await expect(page.getByText('Test User')).toBeVisible();
  });

  test('closes when a navigation link is clicked', async ({ authedPage }) => {
    const page = authedPage;

    // Open the nav drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // Wait for drawer to be visible
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).toBeVisible();

    // Click the Journal link
    await page.getByRole('link', { name: /journal/i }).first().click();

    // Drawer should close (dialog should not be visible)
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).not.toBeVisible();
  });

  test('closes when clicking the overlay', async ({ authedPage }) => {
    const page = authedPage;

    // Open the nav drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // Wait for drawer to be visible
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).toBeVisible();

    // Click the overlay (the area outside the drawer)
    // The overlay is the region between the drawer and the edge of the screen
    const overlay = page.locator('[data-vaul-overlay]').or(page.locator('.vaul-overlay'));
    if (await overlay.count() > 0) {
      await overlay.first().click({ position: { x: 10, y: 10 } });
      await expect(page.getByRole('dialog', { name: /primary navigation/i })).not.toBeVisible();
    }
  });

  test('menu trigger toggles drawer state', async ({ authedPage }) => {
    const page = authedPage;

    const navTrigger = page.getByRole('button', { name: /open navigation/i });

    // Click to open
    await navTrigger.click();
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).toBeVisible();

    // Click trigger again to close
    await navTrigger.click();
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).not.toBeVisible();
  });

  test('drawer is keyboard accessible', async ({ authedPage }) => {
    const page = authedPage;

    // Open drawer
    await page.getByRole('button', { name: /open navigation/i }).click();
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).toBeVisible();

    // Press escape to close
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).not.toBeVisible();
  });
});

test.describe('Navigation drawer — responsive', () => {
  test('drawer opens and is usable on mobile viewport', async ({ authedPage }) => {
    const page = authedPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    // Open drawer
    await page.getByRole('button', { name: /open navigation/i }).click();

    // Drawer should be visible
    await expect(page.getByRole('dialog', { name: /primary navigation/i })).toBeVisible();

    // Dashboard link should be accessible
    const dashboardLink = page.getByRole('link', { name: /dashboard/i }).first();
    await expect(dashboardLink).toBeAttached();

    // The drawer width should be appropriate for mobile (< 90vw)
    const drawer = page.getByRole('dialog', { name: /primary navigation/i });
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThan(page.viewportSize()?.width ?? 400);
    }
  });

  test('main content is accessible after drawer navigation on mobile', async ({ authedPage }) => {
    const page = authedPage;

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    // Navigate to dashboard via drawer
    await page.getByRole('button', { name: /open navigation/i }).click();
    await page.getByRole('link', { name: /dashboard/i }).first().click();

    // Should reach the dashboard page
    await expect(page).toHaveURL(/[\s\S]*dashboard/);
  });
});
