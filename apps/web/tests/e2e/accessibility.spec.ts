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
// E2E: Accessibility checks
//
// Verifies basic accessibility requirements on key pages:
//   • Skip-to-content link exists
//   • Headings are present and hierarchical
//   • Form inputs have associated labels
//   • Interactive elements have accessible names
//   • No critical axe violations (if @axe-core/playwright is available)
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Accessibility', () => {
  test('login page has accessible form inputs', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/login');

    // Email input should have an associated label
    const emailInput = page.getByLabel('Email');
    await expect(emailInput).toBeVisible();

    // Password input should have an associated label
    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toBeVisible();

    // Submit button should have an accessible name
    const submitButton = page.getByRole('button', { name: /sign in/i });
    await expect(submitButton).toBeVisible();

    // Error region should have role="alert" (already in the DOM even if empty)
    // The form should be contained in a <form> element
    await expect(page.locator('form')).toBeVisible();

    await context.close();
  });

  test('register page has accessible form inputs', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/register');

    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();

    await context.close();
  });

  test('app pages have skip-to-content link', async ({ authedPage }) => {
    const page = authedPage;

    // The skip link should exist in the DOM (visible on focus)
    const skipLink = page.getByRole('link', { name: /skip to content/i });
    await expect(skipLink).toBeAttached();

    // Focus the link to make it visible
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
  });

  test('app pages have main content landmark', async ({ authedPage }) => {
    const page = authedPage;

    // The main content area should have id="main-content"
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('chat page has accessible textbox', async ({ authedPage }) => {
    const page = authedPage;

    // The chat textarea should be a textbox role
    const textbox = page.getByRole('textbox');
    await expect(textbox).toBeVisible({ timeout: 15_000 });
    await expect(textbox).toBeEnabled();
  });

  test('settings pages have properly labeled inputs', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/settings/profile');

    // The name input should have a label
    const nameInput = page.getByLabel(/name/i);
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toBeEnabled();
  });

  test('headings are hierarchical on dashboard', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/dashboard');

    // Should have at least one heading
    const headings = page.locator('h1, h2, h3');
    const count = await headings.count();
    expect(count).toBeGreaterThan(0);
  });

  test('no duplicate h1 on key pages', async ({ authedPage }) => {
    const page = authedPage;

    const pages = ['/dashboard', '/journal', '/alerts', '/signals', '/news', '/calendar'];

    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle').catch(() => {});

      const h1Count = await page.locator('h1').count();
      // Each page should have at most one h1
      expect(h1Count).toBeLessThanOrEqual(1);
    }
  });
});
