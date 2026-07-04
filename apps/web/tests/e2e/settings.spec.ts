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
// E2E: Settings flows
//
// Covers: profile update, API key save/test, symbol watchlist add/remove/
// reorder, model picker selection, usage budget setting.
// Uses the composable fixtures (authedPage).
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Settings', () => {
  test('1. Profile update flow — update display name and save', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/settings/profile');
    await expect(page.getByRole('heading', { name: /profile/i })).toBeVisible();

    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill('Updated Test User');
    await page.getByRole('button', { name: /save|submit/i }).click();

    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('2. API key save + test flow — enter key, test, save', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/settings/api-keys');
    await expect(page.getByRole('heading', { name: /api keys/i })).toBeVisible();

    const googleInput = page.locator('input#key-google');
    await googleInput.fill('test-google-key-12345');

    await page.getByRole('button', { name: /test connection/i }).first().click();
    await expect(page.getByText(/testing/i)).toBeVisible({ timeout: 5_000 });

    const saveButton = page.getByRole('button', { name: /save keys/i });
    await saveButton.click();
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 10_000 });
  });

  test('3. Symbol add/remove/reorder flow', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/settings/symbols');
    await expect(page.getByRole('heading', { name: /symbols watchlist/i })).toBeVisible();

    // Add EURUSD
    await page.getByPlaceholder(/search catalog by symbol or name/i).fill('EURUSD');
    await page.getByRole('button', { name: /add EURUSD to watchlist/i }).click();
    await expect(page.getByText(/EURUSD added to watchlist/i)).toBeVisible({ timeout: 10_000 });

    // Reorder — move up
    await page.getByRole('button', { name: /move symbol up/i }).first().click();

    // Remove
    await page.getByRole('button', { name: /remove EURUSD from watchlist/i }).click();
    await expect(page.getByText(/EURUSD removed from watchlist/i)).toBeVisible({ timeout: 10_000 });
  });

  test('4. Model picker selection flow — select a chat model', async ({ authedPage }) => {
    const page = authedPage;

    // Mock the chat model API
    await page.route('**/api/settings/chat-model', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ chatModel: null }),
        });
      } else if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ chatModel: 'google:gemini-2.0-flash' }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/models');
    await expect(page.getByRole('heading', { name: /models/i })).toBeVisible();

    const select = page.locator('select').first();
    await expect(select).toBeEnabled({ timeout: 15_000 });

    const options = await select.locator('option').all();
    if (options.length > 1) {
      const firstOptionValue = await options[1]!.getAttribute('value');
      if (firstOptionValue) {
        await select.selectOption(firstOptionValue);
        await expect(page.getByText(/current chat model updated/i)).toBeVisible({ timeout: 10_000 });
      }
    }
  });

  test('5. Usage budget setting flow — set monthly budget limit', async ({ authedPage }) => {
    const page = authedPage;

    await page.goto('/settings/usage');
    await expect(page.getByRole('heading', { name: /limits & alerts/i })).toBeVisible();

    const budgetInput = page.locator('input#monthlyBudgetLimit');
    await budgetInput.fill('50');

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/usage limits and alerts updated successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('6. Settings navigation — all settings pages load', async ({ authedPage }) => {
    const page = authedPage;

    const settingsPages = [
      { path: '/settings/profile', heading: /profile/i },
      { path: '/settings/api-keys', heading: /api keys/i },
      { path: '/settings/symbols', heading: /symbols watchlist/i },
      { path: '/settings/models', heading: /models/i },
      { path: '/settings/usage', heading: /limits & alerts/i },
    ];

    for (const { path, heading } of settingsPages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
    }
  });
});
