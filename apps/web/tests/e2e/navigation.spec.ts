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
// E2E: Navigation
//
// Verifies that all major app routes load without errors when authenticated.
// Covers: dashboard, chat, journal, alerts, signals, news, calendar, chart,
// settings sub-pages, and offline page.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Navigation — authenticated routes', () => {
  const routes = [
    { path: '/dashboard', heading: null, urlCheck: /.*\/dashboard/ },
    { path: '/chat', heading: null, urlCheck: /.*\/chat/ },
    { path: '/journal', heading: /journal/i },
    { path: '/alerts', heading: /alerts/i },
    { path: '/signals', heading: /ai signals/i },
    { path: '/news', heading: /news/i },
    { path: '/calendar', heading: /calendar/i },
    { path: '/settings/profile', heading: /profile/i },
    { path: '/settings/api-keys', heading: /api keys/i },
    { path: '/settings/symbols', heading: /symbols watchlist/i },
    { path: '/settings/models', heading: /models/i },
    { path: '/settings/usage', heading: /limits & alerts/i },
    { path: '/settings/agent', heading: null, urlCheck: /.*\/settings\/agent/ },
    { path: '/settings/billing', heading: null, urlCheck: /.*\/settings\/billing/ },
    { path: '/settings/portfolio', heading: null, urlCheck: /.*\/settings\/portfolio/ },
    { path: '/settings/telegram', heading: null, urlCheck: /.*\/settings\/telegram/ },
    { path: '/settings/track-record', heading: null, urlCheck: /.*\/settings\/track-record/ },
    { path: '/offline', heading: /offline/i },
  ];

  for (const route of routes) {
    test(`can navigate to ${route.path}`, async ({ authedPage }) => {
      const page = authedPage;
      await page.goto(route.path);

      // Should not redirect to login
      await expect(page).not.toHaveURL(/.*\/login/);

      // Check URL matches expected pattern
      if (route.urlCheck) {
        await expect(page).toHaveURL(route.urlCheck);
      }

      // Check heading if specified
      if (route.heading) {
        await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible({
          timeout: 15_000,
        });
      }

      // Page should not show an unhandled error
      // (Next.js error pages have a specific heading)
      await expect(page.getByText(/application error/i)).not.toBeVisible();
    });
  }

  test('chart page loads for a symbol', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chart/XAUUSD');

    // Should not redirect to login
    await expect(page).not.toHaveURL(/.*\/login/);
  });

  test('settings index page loads', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/settings');

    await expect(page).not.toHaveURL(/.*\/login/);
    await expect(page).toHaveURL(/.*\/settings/);
  });
});
