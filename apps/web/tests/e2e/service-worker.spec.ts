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
// E2E: PWA Service Worker
//
// Verifies that the service worker registers and activates correctly.
// Also checks offline page accessibility and cache behavior.
// ---------------------------------------------------------------------------

import { test, expect } from '@playwright/test';

test.describe('PWA Service Worker', () => {
  test('should register and activate', async ({ page }) => {
    await page.goto('/');

    // Wait for SW to reach 'activated' state.
    const swState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;

      if (registration.active?.state === 'activated') {
        return 'activated';
      }

      return new Promise<string>((resolve) => {
        const sw = registration.installing || registration.waiting || registration.active;
        if (!sw) {
          resolve('no-service-worker');
          return;
        }
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated' || sw.state === 'redundant') {
            resolve(sw.state);
          }
        });
        setTimeout(() => resolve(sw.state), 10_000);
      });
    });

    expect(swState).toBe('activated');
  });

  test('offline page is accessible and has retry button', async ({ page }) => {
    await page.goto('/offline');

    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible();
    await expect(page.getByText(/no connection to the market feed/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /retry connection/i })).toBeVisible();
  });

  test('service worker controls the page after activation', async ({ page }) => {
    await page.goto('/');

    const controlled = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return !!navigator.serviceWorker.controller;
    });

    expect(controlled).toBe(true);
  });
});
