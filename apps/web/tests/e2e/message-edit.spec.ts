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
// E2E: Message edit mode (Phase 7)
//
// Verifies the inline edit affordance on user messages: the edit textarea
// is accessible by name, Escape cancels without submitting, and
// Cmd/Ctrl+Enter saves the revision through the chat API.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

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

    const textarea = page.getByRole('textbox', { name: /chat message input/i });
    await textarea.fill('Original question');
    await textarea.press('Enter');
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /edit prompt/i }).click();
    const editBox = page.getByRole('textbox', { name: /edit message/i });
    await editBox.fill('Revised question');
    await page.keyboard.press('Control+Enter');

    // Edit closes; the revised text is now the user message.
    await expect(page.getByRole('textbox', { name: /edit message/i })).not.toBeVisible();
    await expect(page.getByText('Revised question')).toBeVisible();
  });
});
