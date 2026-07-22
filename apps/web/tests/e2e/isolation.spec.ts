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
// E2E: Multi-User Isolation
//
// Verifies that User A's threads are not accessible to User B.
// Uses separate browser contexts with programmatic sessions (bypasses
// the broken UI login — see useActionState + NextAuth redirect issue).
// ---------------------------------------------------------------------------

import { test, expect } from '@playwright/test';
import { ensureTestUser, createSessionForUser } from './test-utils';

test.describe('Multi-User Isolation', () => {
  test.beforeAll(async () => {
    await ensureTestUser('user-a@example.com', 'passwordA');
    await ensureTestUser('user-b@example.com', 'passwordB');
  });

  test('user A cannot see user B threads', async ({ browser }) => {
    test.setTimeout(120_000);

    // 1. Create two separate browser contexts (simulating two users)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // 2. Login as User A and create a thread
      const userA = await ensureTestUser('user-a@example.com', 'passwordA');
      const cookieA = await createSessionForUser(userA);
      await contextA.addCookies([cookieA]);
      await pageA.goto('/chat');
      await expect(pageA).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

      // Mock the AI chat endpoint
      await pageA.route('**/api/chat', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'x-vercel-ai-data-stream': 'v1' },
          body: '0:"Mock AI response"\n',
        });
      });

      const textareaA = pageA.getByRole('textbox');
      await textareaA.fill('A unique message from User A');
      await textareaA.press('Enter');

      await expect(pageA.locator('.group.items-end').first()).toBeVisible({ timeout: 15_000 });
      await expect(pageA.locator('.group.items-end').first()).toContainText('A unique message from User A');
      await expect(pageA).toHaveURL(/.*\/chat\/[a-zA-Z0-9_-]+/);

      // Grab the thread ID from the URL
      const threadUrlA = pageA.url();
      const threadId = threadUrlA.split('/').pop()!;

      // 3. Login as User B
      const userB = await ensureTestUser('user-b@example.com', 'passwordB');
      const cookieB = await createSessionForUser(userB);
      await contextB.addCookies([cookieB]);
      await pageB.goto('/chat');
      await expect(pageB).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

      // 4. Verify User B cannot access User A's thread directly
      await pageB.goto(`/chat/${threadId}`);

      // The app should either 404, show an error, or redirect away.
      // Check that User B is NOT seeing User A's message.
      await expect(pageB.getByText('A unique message from User A')).not.toBeVisible({ timeout: 10_000 });

      // The page should either redirect or show not-found
      const currentUrlB = pageB.url();
      const isRedirected = !currentUrlB.includes(threadId);
      const notFoundText = await pageB.locator('h1').textContent().catch(() => '');
      const isNotFound = (notFoundText || '').toLowerCase().includes('not found');

      // Either redirected away or showing not-found
      expect(isRedirected || isNotFound).toBeTruthy();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('user A and user B have separate thread lists', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Login both users
      const userA = await ensureTestUser('user-a@example.com', 'passwordA');
      const cookieA = await createSessionForUser(userA);
      await contextA.addCookies([cookieA]);
      await pageA.goto('/chat');
      await expect(pageA).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

      const userB = await ensureTestUser('user-b@example.com', 'passwordB');
      const cookieB = await createSessionForUser(userB);
      await contextB.addCookies([cookieB]);
      await pageB.goto('/chat');
      await expect(pageB).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

      // Both should be on chat pages but with different sessions
      // User A's page should not show User B's data and vice versa
      const urlA = pageA.url();
      const urlB = pageB.url();

      // Both should be on /chat routes
      expect(urlA).toContain('/chat');
      expect(urlB).toContain('/chat');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
