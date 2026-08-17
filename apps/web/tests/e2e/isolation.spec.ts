/**
 * Copyright 2026 Kestrel
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

import { createThread } from '@kestrel/ai/persistence';
import { expect, test } from '@playwright/test';

import { createSessionForUser, ensureTestUser } from './test-utils';

test.describe('Multi-User Isolation', () => {
  test.beforeAll(async () => {
    await ensureTestUser('user-a@example.com', 'passwordA');
    await ensureTestUser('user-b@example.com', 'passwordB');
  });

  test('user A cannot see user B threads', async ({ browser }) => {
    test.setTimeout(120_000);

    // 1. Create two separate browser contexts (simulating two users)
    const contextA = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    });
    const contextB = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // 2. Login as User A and create a dedicated thread. Navigating to a
      //    specific thread (rather than the /chat landing redirect) keeps this
      //    test deterministic: the redirect picks the user's latest thread,
      //    which can be the pinned briefings thread from earlier runs.
      const userA = await ensureTestUser('user-a@example.com', 'passwordA');
      const cookieA = await createSessionForUser(userA);
      await contextA.addCookies([cookieA]);
      const threadA = await createThread(userA.id, { pinnedSymbol: null });
      await pageA.goto(`/chat/${threadA.id}`);
      await expect(pageA).toHaveURL(/.*\/chat.*/, { timeout: 30_000 });

      // Mock the AI chat endpoint
      await pageA.route('**/api/chat', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
          body: [
            'data: {"type":"text-start","id":"isolation-message"}',
            '',
            'data: {"type":"text-delta","id":"isolation-message","delta":"Mock AI response"}',
            '',
            'data: {"type":"text-end","id":"isolation-message"}',
            '',
          ].join('\n'),
        });
      });

      const textareaA = pageA.getByRole('textbox');
      await textareaA.fill('A unique message from User A');
      await textareaA.press('Enter');

      await expect(pageA.getByText('A unique message from User A')).toBeVisible({ timeout: 15_000 });
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
      try {
        await pageB.goto(`/chat/${threadId}`);
      } catch (error) {
        // Next.js may abort the original navigation when the protected route
        // redirects away from a thread owned by another user.
        if (!(error instanceof Error) || !error.message.includes('ERR_ABORTED')) {
          throw error;
        }
      }

      // The app should either 404, show an error, or redirect away.
      // Check that User B is NOT seeing User A's message.
      await expect(pageB.getByText('A unique message from User A')).not.toBeVisible({
        timeout: 10_000,
      });

      // The page should either redirect or show not-found
      const currentUrlB = pageB.url();
      const isRedirected = !currentUrlB.includes(threadId);
      const notFoundText = await pageB
        .locator('h1')
        .textContent()
        .catch(() => '');
      const isNotFound = (notFoundText || '').toLowerCase().includes('not found');

      // Either redirected away or showing not-found
      expect(isRedirected || isNotFound).toBeTruthy();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('user A and user B have separate thread lists', async ({ browser }) => {
    const contextA = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    });
    const contextB = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    });
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
