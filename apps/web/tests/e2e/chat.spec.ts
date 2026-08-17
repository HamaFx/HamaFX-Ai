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
// E2E: Chat flows
//
// Covers: new thread creation, message send/receive, thread URL navigation,
// chat mock responses, thread sidebar, and empty state.
// Uses the composable fixtures (authedPage + mockChatApi).
// ---------------------------------------------------------------------------

import { appendUserMessage, createThread, deleteThread } from '@kestrel/ai/persistence';
import type { UIMessage } from 'ai';

import { test, expect } from './fixtures';
import { ensureTestUser } from './test-utils';

test.describe('Chat Flows', () => {
  test('can create a new thread and send a message', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;

    // Mock the AI chat endpoint
    await mockChatApi(page, {
      singleAgentBody: '0:"Mock AI response"\n',
    });

    // Type a message using the textarea
    const textarea = page.getByRole('textbox');
    await textarea.fill('What is the current price of gold?');
    await textarea.press('Enter');

    // Expect the user's message to be visible
    await expect(page.locator('.group.items-end').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.group.items-end').first()).toContainText('What is the current price of gold?');

    // Check that we redirected to a specific thread URL
    await expect(page).toHaveURL(/.*\/chat\/[a-zA-Z0-9_-]+/);
  });

  test('displays mock AI response after sending message', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;

    await mockChatApi(page, {
      singleAgentBody: '0:"Mock AI response"\n',
    });

    const textarea = page.getByRole('textbox');
    await textarea.fill('Tell me about EURUSD');
    await textarea.press('Enter');

    // The mock response should appear
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });
  });

  test('chat page loads with thread list or empty state', async ({ authedPage }) => {
    const page = authedPage;

    // Should be on a chat page — either a specific thread or the landing
    await expect(page).toHaveURL(/.*\/chat.*/);

    // The page should have a textarea for composing messages
    await expect(page.getByRole('textbox')).toBeVisible({ timeout: 15_000 });
  });

  test('can navigate between threads via URL', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;

    await mockChatApi(page);

    // Send a message to populate the fixture thread.
    const textarea = page.getByRole('textbox');
    await textarea.fill('Test message for thread navigation');
    await textarea.press('Enter');
    await expect(page).toHaveURL(/.*\/chat\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });
    const threadAUrl = page.url();
    const threadAId = new URL(threadAUrl).pathname.split('/').pop();
    if (!threadAId) throw new Error(`Could not determine thread id from ${threadAUrl}`);

    // The mocked stream bypasses the real route persistence, so seed the
    // message explicitly — this verifies reload/navigation persistence rather
    // than mock side effects.
    const user = await ensureTestUser('test@example.com', 'password123');
    await appendUserMessage(user.id, threadAId, {
      id: `e2e-navigation-a-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: 'Test message for thread navigation' }],
    } as UIMessage);

    // Create a second, distinct thread with its own seeded message. Navigating
    // between two DIFFERENT thread URLs avoids the same-URL navigation race
    // (a goto to the current URL can be aborted by the client router's own
    // refresh under parallel workers).
    const threadB = await createThread(user.id, { pinnedSymbol: null });
    await appendUserMessage(user.id, threadB.id, {
      id: `e2e-navigation-b-${Date.now()}`,
      role: 'user',
      parts: [{ type: 'text', text: 'Second thread message' }],
    } as UIMessage);

    // Navigate to thread B via URL and confirm its message renders.
    await page.goto(`/chat/${threadB.id}`, { waitUntil: 'load' });
    await expect(page.getByText('Second thread message')).toBeVisible({ timeout: 15_000 });

    // Navigate back to thread A via URL and confirm its message renders.
    await page.goto(threadAUrl, { waitUntil: 'load' });
    await expect(page).toHaveURL(threadAUrl);
    await expect(page.getByText('Test message for thread navigation')).toBeVisible({ timeout: 15_000 });

    await deleteThread(user.id, threadB.id).catch(() => undefined);
  });

  test('chat handles API error gracefully', async ({ authedPage }) => {
    const page = authedPage;

    // Mock a server error
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    const textarea = page.getByRole('textbox');
    await textarea.fill('This should fail');
    await textarea.press('Enter');

    // The user message should still appear
    await expect(page.getByText('This should fail')).toBeVisible({ timeout: 15_000 });

    // The app should not crash — textarea should still be usable
    await expect(textarea).toBeVisible();
  });
});
