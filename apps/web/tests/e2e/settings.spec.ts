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
import { ensureTestUser } from './test-utils';

test.describe('Settings', () => {
  test.beforeAll(async () => {
    await ensureTestUser('test@example.com', 'password123');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30000 });
  });

  test('1. Profile update flow — update display name and save', async ({ page }) => {
    await page.goto('/settings/profile');
    await expect(page.locator('h2')).toContainText('Profile');

    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill('Updated Test User');
    await page.click('button[type="submit"]');

    await expect(page.getByText('Profile updated successfully')).toBeVisible({ timeout: 10000 });
  });

  test('2. API key save + test flow — enter key, test, save', async ({ page }) => {
    await page.goto('/settings/api-keys');
    await expect(page.locator('h2')).toContainText('API Keys');

    const googleInput = page.locator('input#key-google');
    await googleInput.fill('test-google-key-12345');

    await page.locator('button:has-text("Test connection")').first().click();
    await expect(page.getByText('Testing…')).toBeVisible({ timeout: 5000 });

    const saveButton = page.locator('button:has-text("Save Keys")');
    await saveButton.click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 });
  });

  test('3. Symbol add/remove/reorder flow', async ({ page }) => {
    await page.goto('/settings/symbols');
    await expect(page.locator('h2')).toContainText('Symbols Watchlist');

    await page.locator('input[placeholder="Search catalog by symbol or name..."]').fill('EURUSD');
    await page.locator('button[aria-label="Add EURUSD to watchlist"]').click();
    await expect(page.getByText('EURUSD added to watchlist')).toBeVisible({ timeout: 10000 });

    await page.locator('input[aria-label="Move symbol up"]').first().click();

    await page.locator('button[aria-label="Remove EURUSD from watchlist"]').click();
    await expect(page.getByText('EURUSD removed from watchlist')).toBeVisible({ timeout: 10000 });
  });

  test('4. Model picker selection flow — select a chat model', async ({ page }) => {
    await page.route('**/api/settings/chat-model', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatModel: null }) });
      } else if (route.request().method() === 'PUT') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatModel: 'google:gemini-2.0-flash' }) });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/models');
    await expect(page.locator('h2')).toContainText('Models');

    const select = page.locator('select').first();
    await expect(select).toBeEnabled({ timeout: 15000 });

    const options = await select.locator('option').all();
    if (options.length > 1) {
      const firstOptionValue = await options[1]!.getAttribute('value');
      if (firstOptionValue) {
        await select.selectOption(firstOptionValue);
        await expect(page.getByText('Current chat model updated')).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('5. Usage budget setting flow — set monthly budget limit', async ({ page }) => {
    await page.goto('/settings/usage');
    await expect(page.locator('h2')).toContainText('Limits & Alerts');

    const budgetInput = page.locator('input#monthlyBudgetLimit');
    await budgetInput.fill('50');

    await page.locator('button:has-text("Save Changes")').click();
    await expect(page.getByText('Usage limits and alerts updated successfully')).toBeVisible({ timeout: 10000 });
  });
});
