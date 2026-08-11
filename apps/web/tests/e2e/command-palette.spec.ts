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
// E2E: Command palette (Phase 6)
//
// Verifies the global ⌘K / Ctrl-K launcher: keyboard open, accessible
// search input, live result-count announcements, arrow-key navigation,
// Enter to run a command, and Escape to close.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Command palette', () => {
  test('opens with Ctrl+K and shows the search input', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await page.keyboard.press('Control+K');

    const search = page.getByRole('combobox', { name: /search commands/i });
    await expect(search).toBeVisible();
    await expect(search).toBeFocused();
  });

  test('announces a live result count while typing', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await page.keyboard.press('Control+K');
    const search = page.getByRole('combobox', { name: /search commands/i });
    await search.fill('settings');

    // The sr-only live region announces the filtered result count.
    const status = page.locator('#command-result-count');
    await expect(status).toHaveText(/\d+ commands? available/);
  });

  test('arrow keys move the active option', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await page.keyboard.press('Control+K');
    const search = page.getByRole('combobox', { name: /search commands/i });
    await search.fill('a');

    await expect(search).toHaveAttribute('aria-activedescendant', 'command-option-0');
    await page.keyboard.press('ArrowDown');
    // aria-activedescendant on the combobox tracks the second row.
    await expect(search).toHaveAttribute('aria-activedescendant', 'command-option-1');
  });

  test('Enter runs the selected command and closes the palette', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await page.keyboard.press('Control+K');
    const search = page.getByRole('combobox', { name: /search commands/i });
    await search.fill('settings');

    await page.keyboard.press('Enter');
    // Navigating to /settings runs the command and closes the drawer.
    await expect(page).toHaveURL(/\/settings/, { timeout: 15_000 });
  });

  test('Escape closes the palette without navigating', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await page.keyboard.press('Control+K');
    await expect(page.getByRole('combobox', { name: /search commands/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('combobox', { name: /search commands/i })).not.toBeVisible();
  });

  test('shows an empty state when nothing matches', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    await page.keyboard.press('Control+K');
    const search = page.getByRole('combobox', { name: /search commands/i });
    await search.fill('zzzzzz-no-such-command');

    await expect(page.getByText('No commands match.')).toBeVisible();
  });
});
