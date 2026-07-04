import { test, expect } from '@playwright/test';

test.describe('PWA Service Worker', () => {
  test('should register and activate', async ({ page }) => {
    await page.goto('/');

    // Wait for SW to reach 'activated' state.
    // navigator.serviceWorker.ready resolves when activation starts,
    // but the state may still be 'activating'. Wait for statechange.
    const swState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;

      if (registration.active?.state === 'activated') {
        return 'activated';
      }

      // If still activating, wait for the state to change
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
        // Timeout safety: resolve with current state after 10s
        setTimeout(() => resolve(sw.state), 10_000);
      });
    });

    expect(swState).toBe('activated');
  });
});
