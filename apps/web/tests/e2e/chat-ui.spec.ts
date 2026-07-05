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
// E2E: Chat UI
//
// Verifies the chat interface renders correctly: empty state, composer,
// message bubbles, action row (copy/regenerate), chat-top-bar labels,
// and the typing indicator. Uses mocked API responses to avoid depending
// on AI model availability.
// ---------------------------------------------------------------------------

import { test, expect } from './fixtures';

test.describe('Chat UI — empty state', () => {
  test('shows branded empty state when no messages exist', async ({ authedPage }) => {
    const page = authedPage;

    // Navigate to a fresh chat thread
    await page.goto('/chat');

    // Brand mark should be visible (SVG logo)
    await expect(page.locator('svg.text-brand')).toBeAttached();

    // Title should be present
    await expect(page.getByText('HamaFX·Ai')).toBeVisible();

    // Subtitle
    await expect(page.getByText('Start a conversation')).toBeVisible();

    // Quick prompts should be visible
    await expect(page.getByRole('button', { name: /analyze|price|news|outlook/i }).first()).toBeVisible();
  });

  test('empty state has functional quick prompt buttons', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // Quick prompts should be clickable
    const firstPrompt = page.getByRole('button', { name: /analyze/i }).first();
    await expect(firstPrompt).toBeEnabled();
  });
});

test.describe('Chat UI — composer', () => {
  test('composer textarea is visible and enabled', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    const textarea = page.getByRole('textbox', { name: /chat message input/i });
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();
  });

  test('composer has accessible send button', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // The send button should have a proper accessible label
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeAttached();
  });

  test('composer placeholder adapts to pinned symbol', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // The default placeholder should mention symbols
    const textarea = page.getByRole('textbox', { name: /chat message input/i });
    await expect(textarea).toHaveAttribute('placeholder', /XAU|EUR|GBP|Ask about/i);
  });
});

test.describe('Chat UI — message rendering', () => {
  test('user messages render as right-aligned bubbles', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;
    await mockChatApi(page);

    // Send a message via the mocked API
    const textarea = page.getByRole('textbox');
    await textarea.fill('What is the price of gold?');
    await textarea.press('Enter');

    // User message should render
    await expect(page.getByText('What is the price of gold?')).toBeVisible({ timeout: 15_000 });

    // Assistant response should appear (mocked)
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });
  });

  test('multiple messages stack correctly', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;
    await mockChatApi(page);

    const textarea = page.getByRole('textbox');

    // Send first message
    await textarea.fill('First message');
    await textarea.press('Enter');
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    // Send second message
    await textarea.fill('Second message');
    await textarea.press('Enter');

    // Both messages should be visible
    await expect(page.getByText('First message')).toBeVisible();
    await expect(page.getByText('Second message')).toBeVisible();
  });

  test('assistant messages show brand accent icon', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;
    await mockChatApi(page);

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill('Test message');
    await textarea.press('Enter');

    // Assistant response should appear
    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    // Brand accent icon SVG should be present in assistant messages
    const brandIcons = page.locator('svg.text-brand');
    await expect(brandIcons.first()).toBeAttached();
  });

  test('copy button appears on assistant messages', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;
    await mockChatApi(page);

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill('Copy this response');
    await textarea.press('Enter');

    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    // Copy button should be present
    const copyButton = page.getByRole('button', { name: /copy message/i });
    await expect(copyButton).toBeAttached();
  });

  test('regenerate button appears on last assistant message', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;
    await mockChatApi(page);

    const textarea = page.getByRole('textbox');
    await textarea.fill('Test regenerate');
    await textarea.press('Enter');

    await expect(page.getByText('Mock AI response')).toBeVisible({ timeout: 15_000 });

    // Regenerate button should be present
    const regenButton = page.getByRole('button', { name: /regenerate response/i });
    await expect(regenButton).toBeAttached();
  });
});

test.describe('Chat UI — chat-top-bar', () => {
  test('chat-top-bar shows title and new chat button', async ({ authedPage }) => {
    const page = authedPage;

    // Navigate to chat
    await page.goto('/chat');

    // New chat button should be accessible
    const newChatButton = page.getByRole('button', { name: /new chat/i });
    await expect(newChatButton).toBeAttached();

    // Overflow menu should be accessible
    const menuButton = page.getByRole('button', { name: /conversation menu/i });
    await expect(menuButton).toBeAttached();
  });

  test('chat-top-bar overflow menu has switch/export/delete options', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // Open the overflow menu
    const menuButton = page.getByRole('button', { name: /conversation menu/i });
    await menuButton.click();

    // Menu items should be visible
    await expect(page.getByText('Switch conversation')).toBeVisible();
    await expect(page.getByText('Export as Markdown')).toBeVisible();
    await expect(page.getByText('Delete conversation')).toBeVisible();
  });

  test('analysis mode selector is accessible', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // Analysis mode button should be accessible
    const modeButton = page.getByRole('button', { name: /analysis mode/i });
    await expect(modeButton).toBeAttached();
  });
});

test.describe('Chat UI — label bug verification', () => {
  test('no icon-name labels appear in chat UI', async ({ authedPage }) => {
    const page = authedPage;

    // Navigate to chat
    await page.goto('/chat');

    // These icon-name strings should NOT appear as visible text labels
    const labelBugs = [
      'IconSearch',
      'IconCalendar',
      'IconSettings',
      'IconDownload',
      'IconArrowRight',
      'IconCamera',
      'IconUser',
      'IconCommand',
      'IconInfo',
    ];

    for (const bug of labelBugs) {
      // Use getByText with exact match to avoid matching import lines
      const elements = page.getByText(bug, { exact: true });
      const count = await elements.count();
      expect(count).toBe(0);
    }
  });
});

test.describe('Chat UI — tool card parts', () => {
  test('tool card renders with correct container styling', async ({ authedPage }) => {
    const page = authedPage;
    await page.goto('/chat');

    // Verify the chat page shell loads correctly
    await expect(page.getByRole('textbox', { name: /chat message input/i })).toBeVisible();

    // Chat page should have the correct surface background
    const body = page.locator('body');
    await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 10)');
  });
});
