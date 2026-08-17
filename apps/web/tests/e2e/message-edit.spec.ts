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
// E2E: Message edit mode (Phase 7)
//
// Verifies the inline edit affordance on user messages: the edit textarea
// is accessible by name, Escape cancels without submitting, and
// Cmd/Ctrl+Enter saves the revision through the chat API.
// ---------------------------------------------------------------------------

import { appendUserMessage } from '@kestrel/ai/persistence';
import type { UIMessage } from 'ai';

import { test, expect } from './fixtures';
import { ensureTestUser } from './test-utils';

test.describe('Message edit mode', () => {
  test('opens an accessible edit textarea from the edit prompt action', async ({
    authedPage,
    mockChatApi,
  }) => {
    const page = authedPage;
    await mockChatApi(page);

    const textarea = page.getByRole('textbox', { name: /chat message input/i });
    await textarea.fill('Original question');
    await textarea.press('Enter');
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /edit prompt/i }).click();

    const editBox = page.getByRole('textbox', { name: /edit message/i });
    await expect(editBox).toBeVisible();
    await expect(editBox).toHaveValue('Original question');
  });

  test('Escape cancels the edit without submitting', async ({
    authedPage,
    mockChatApi,
  }) => {
    const page = authedPage;
    await mockChatApi(page);

    const textarea = page.getByRole('textbox', { name: /chat message input/i });
    await textarea.fill('Original question');
    await textarea.press('Enter');
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /edit prompt/i }).click();
    const editBox = page.getByRole('textbox', { name: /edit message/i });
    await editBox.fill('Changed text');
    await page.keyboard.press('Escape');

    // Edit closes and the original message text remains.
    await expect(page.getByRole('textbox', { name: /edit message/i })).not.toBeVisible();
    await expect(page.getByText('Original question')).toBeVisible();
  });

  test('Ctrl+Enter saves the edited prompt', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;
    await mockChatApi(page);

    // The mocked stream bypasses /api/chat persistence. Capture the exact
    // client message submitted by useChat, then persist that user row so this
    // test exercises the real fork route and its idempotency-key lookup.
    let submittedUserMessage: UIMessage | undefined;
    page.on('request', (request) => {
      if (request.method() !== 'POST' || !/\/api\/chat$/.test(new URL(request.url()).pathname)) return;
      try {
        const body = request.postDataJSON() as { messages?: UIMessage[] };
        const last = body.messages?.at(-1);
        if (last?.role === 'user') submittedUserMessage = last;
      } catch {
        // The mock helper deliberately tolerates malformed request bodies.
      }
    });

    const textarea = page.getByRole('textbox', { name: /chat message input/i });
    await textarea.fill('Original question');
    await textarea.press('Enter');
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });
    expect(submittedUserMessage).toBeDefined();

    const user = await ensureTestUser('test@example.com', 'password123');
    const threadId = new URL(page.url()).pathname.split('/').at(-1);
    expect(threadId).toBeTruthy();
    await appendUserMessage(user.id, threadId!, submittedUserMessage!);

    await page.getByRole('button', { name: /edit prompt/i }).click();
    const editBox = page.getByRole('textbox', { name: /edit message/i });
    await editBox.fill('Revised question');
    await page.keyboard.press('Control+Enter');

    // Editing a non-terminal message branches the thread. Confirm the branch
    // dialog; a successful fork navigates to the new thread URL.
    await page.getByRole('button', { name: /create branch/i }).click();
    await expect(page).toHaveURL(/.*\/chat\/[a-zA-Z0-9_-]+/, { timeout: 15_000 });
    await expect(page.getByText('Revised question')).toBeVisible({ timeout: 15_000 });
  });
});
