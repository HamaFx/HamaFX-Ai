/**
 * Opt-in production-flow E2E tests.
 *
 * These tests intentionally do not mock /api/chat or analysis-job polling.
 * They run only when KESTREL_REAL_E2E=true against an isolated staging
 * environment with real database, worker, and configured model credentials.
 */

import { test, expect } from './fixtures';

test.describe('Real Kestrel system flow', () => {
  test.skip(process.env.KESTREL_REAL_E2E !== 'true', 'requires isolated staging infrastructure');
  test.describe.configure({ mode: 'serial' });

  test('browser reaches the real single-agent chat stream', async ({ authedPage }) => {
    const page = authedPage;
    await page.getByRole('button', { name: /analysis mode/i }).click();
    await page.getByRole('menuitem', { name: /single/i }).click();
    await page.getByRole('textbox').fill('Give a concise, sourced market status for XAUUSD.');
    await page.getByRole('textbox').press('Enter');

    await expect(page.locator('[data-message-role="assistant"]').last()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/unexpected error|failed/i)).not.toBeVisible();
  });

  test('browser reaches the real Full-mode queue and worker terminal result', async ({ authedPage }) => {
    const page = authedPage;
    await page.getByRole('button', { name: /analysis mode/i }).click();
    await page.getByRole('menuitem', { name: /full/i }).click();
    await page.getByRole('textbox').fill('Run a complete Full-mode analysis for XAUUSD and explain the final risk.');
    await page.getByRole('textbox').press('Enter');

    await expect(page.getByText(/multi-agent|queued|technical agent/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-message-role="assistant"]').last()).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/No partial answer was returned|could not be completed/i)).not.toBeVisible();
  });
});
