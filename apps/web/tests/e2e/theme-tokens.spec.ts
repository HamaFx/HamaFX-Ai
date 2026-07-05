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
// E2E: Theme tokens
//
// Verifies that the CSS design token system renders correctly across key
// pages. Tests check that semantic color classes (bear, bull, brand, etc.)
// and surface tokens apply the expected computed CSS values.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Theme tokens — semantic colors', () => {
  test('bear token renders as red accent', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/alerts');

    // Check the computed value of --color-bear via a sample element
    const bearColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bear').trim(),
    );
    // Should be a red-ish color
    expect(bearColor).toBe('#EF4444');
  });

  test('bull token renders as green accent', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/dashboard');

    const bullColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bull').trim(),
    );
    expect(bullColor).toBe('#22C55E');
  });

  test('brand token renders as orange accent', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const brandColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim(),
    );
    expect(brandColor).toBe('#F07010');
  });

  test('bg token renders as near-black', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const bgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    );
    expect(bgColor.toLowerCase()).toBe('#0a0a0a');
  });
});

test.describe('Theme tokens — surface tokens', () => {
  test('body background is near-black', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const bodyBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    // Should be rgb(10, 10, 10) = #0A0A0A
    expect(bodyBg).toBe('rgb(10, 10, 10)');
  });

  test('page content uses elev-1 surfaces', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/alerts');

    // Check that card-like elements (sections) use the correct surface color
    const surfaceColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-bg-elev-1').trim(),
    );
    expect(surfaceColor).toBe('#141414');
  });

  test('border token renders correctly', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/settings/profile');

    const borderColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim(),
    );
    expect(borderColor).toBe('#1E1E1E');
  });
});

test.describe('Theme tokens — text colors', () => {
  test('fg token renders as light gray', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const fgColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-fg').trim(),
    );
    expect(fgColor).toBe('#F0F0F0');
  });

  test('fg-muted token renders', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const fgMuted = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-fg-muted').trim(),
    );
    expect(fgMuted).toBe('#808080');
  });
});

test.describe('Theme tokens — radii', () => {
  test('border radius tokens are 2px (sharp)', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const radiusSm = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--radius-sm').trim(),
    );
    expect(radiusSm).toBe('2px');
  });
});
