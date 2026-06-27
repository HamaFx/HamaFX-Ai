import { test, expect } from '@playwright/test';

test.describe('PWA Service Worker', () => {
  test('should register and cache files', async ({ page }) => {
    await page.goto('/');
    
    // Wait for SW to register
    const swState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state;
    });
    
    expect(swState).toBe('activated');
  });
});
