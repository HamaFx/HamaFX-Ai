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

test.describe('Multi-User Isolation', () => {
  test.beforeAll(async () => {
    // Ensure two test users exist
    await ensureTestUser('user-a@example.com', 'passwordA');
    await ensureTestUser('user-b@example.com', 'passwordB');
  });

  test('user A cannot see user B threads', async ({ browser }) => {
    test.setTimeout(120000);
    // 1. Create two separate browser contexts (simulating two users)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    // 2. Login as User A and create a thread
    await pageA.goto('/login');
    await pageA.fill('input[name="email"]', 'user-a@example.com');
    await pageA.fill('input[name="password"]', 'passwordA');
    await pageA.click('button[type="submit"]');
    await expect(pageA).toHaveURL(/.*\/chat.*/, { timeout: 30000 });

    // Mock the AI chat endpoint
    await pageA.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'x-vercel-ai-data-stream': 'v1' },
        body: '0:"Mock AI response"\n',
      });
    });

    await pageA.fill('textarea', 'A unique message from User A');
    await pageA.press('textarea', 'Enter');
    await expect(pageA.locator('.group.items-end').first()).toBeVisible({ timeout: 15000 });
    await expect(pageA.locator('.group.items-end').first()).toContainText('A unique message from User A');
    await expect(pageA).toHaveURL(/.*\/chat\/[a-zA-Z0-9_-]+/);
    
    // Grab the thread ID from the URL
    const threadUrlA = pageA.url();
    const threadId = threadUrlA.split('/').pop();

    // 3. Login as User B
    await pageB.goto('/login');
    await pageB.fill('input[name="email"]', 'user-b@example.com');
    await pageB.fill('input[name="password"]', 'passwordB');
    await pageB.click('button[type="submit"]');
    await expect(pageB).toHaveURL(/.*\/chat.*/, { timeout: 30000 });

    // 4. Verify User B cannot access User A's thread directly
    if (threadId && threadId !== '') {
      await pageB.goto(`/chat/${threadId}`);
      // The app should either 404, show an error, or redirect
      // Assuming Next.js app handles not-found for unauthorized threads
      const isNotFound = pageB.locator('text=Not Found');
      const isRedirected = pageB.url() === 'http://localhost:3000/' || pageB.url() === 'http://localhost:3000/chat';
      
      // Either it says not found, or it redirected away. We check the URL or content.
      const heading = (await pageB.locator('h1').textContent())?.toLowerCase() || '';
      const accessDenied = heading.includes('not found') || heading.includes('error');
      
      expect(pageB.url() === `http://localhost:3000/chat/${threadId}` ? accessDenied : true).toBeTruthy();
    }
    
    // Close contexts
    await contextA.close();
    await contextB.close();
  });
});
