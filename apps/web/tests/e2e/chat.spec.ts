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

test.describe('Chat Flows', () => {
  test.beforeAll(async () => {
    await ensureTestUser('test@example.com', 'password123');
  });

  test('can create a new thread and send a message', async ({ page }) => {
    // 1. Authenticate
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Wait for the redirect to complete
    await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30000 });

    // Mock the AI chat endpoint to prevent missing API key errors
    await page.route('**/api/chat', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'x-vercel-ai-data-stream': 'v1' },
        body: '0:"Mock AI response"\n',
      });
    });
    
    // 3. Type a message
    // The placeholder varies based on pinned symbols, so we select the textarea
    await page.fill('textarea', 'What is the current price of gold?');
    
    // Press the Send button or Enter
    await page.press('textarea', 'Enter');

    // 4. Expect the user's message to be visible and thread ID to be generated
    await expect(page.locator('.group.items-end').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.group.items-end').first()).toContainText('What is the current price of gold?');
    
    // Check that we redirected to a specific thread URL
    await expect(page).toHaveURL(/.*\/chat\/[a-zA-Z0-9_-]+/);
  });
});
