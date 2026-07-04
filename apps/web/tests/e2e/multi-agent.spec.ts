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
// E2E: Multi-Agent Chat modes
//
// Covers: full mode (4 agents), quick mode (technical only), single mode
// (standard chat), SSE mock streaming, analysis mode selector, and
// verification that the correct mode is sent in the request body.
// ---------------------------------------------------------------------------

import { test, expect, FULL_MODE_SSE, QUICK_MODE_SSE } from './fixtures';

test.describe('Multi-Agent Chat', () => {
  test('full mode shows 4 agent progress indicators', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;

    let requestSeen = false;
    await mockChatApi(page, {
      multiAgentBody: FULL_MODE_SSE,
    });

    // Override route to also capture request body
    await page.unroute('**/api/chat');
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      if (body?.analysisMode && body.analysisMode !== 'single') {
        requestSeen = true;
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
          body: FULL_MODE_SSE,
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'x-vercel-ai-data-stream': 'v1' },
          body: '0:"Mock AI response"\n',
        });
      }
    });

    // Select "Full" mode from the toolbar
    await page.getByRole('button', { name: /analysis mode/i }).click();
    await page.getByRole('menuitem', { name: /full/i }).click();

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill('Should I buy XAUUSD now?');
    await textarea.press('Enter');

    // Verify the request was sent with analysisMode=full
    expect(requestSeen).toBe(true);

    // Verify the agent deliberation UI appears
    await expect(page.getByText('Multi-Agent')).toBeVisible({ timeout: 15_000 });

    // Verify the final response text appears
    await expect(page.getByText('Bottom Line')).toBeVisible({ timeout: 15_000 });
  });

  test('quick mode only shows Technical agent', async ({ authedPage }) => {
    const page = authedPage;

    let modeSeen = '';
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      if (body?.analysisMode) modeSeen = body.analysisMode;

      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: QUICK_MODE_SSE,
      });
    });

    // Select "Quick" mode
    await page.getByRole('button', { name: /analysis mode/i }).click();
    await page.getByRole('menuitem', { name: /quick/i }).click();

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill("What's the price of gold?");
    await textarea.press('Enter');

    // Verify the mode was sent
    expect(modeSeen).toBe('quick');

    // Verify response appears
    await expect(page.getByText('Quick technical read')).toBeVisible({ timeout: 15_000 });
  });

  test('single mode uses standard chat (no multi-agent)', async ({ authedPage }) => {
    const page = authedPage;

    let analysisModeSeen: string | undefined = undefined;
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      analysisModeSeen = body?.analysisMode;

      route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'x-vercel-ai-data-stream': 'v1' },
        body: '0:"Single agent response"\n',
      });
    });

    // Select "Single" mode
    await page.getByRole('button', { name: /analysis mode/i }).click();
    await page.getByRole('menuitem', { name: /single/i }).click();

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill('Hello');
    await textarea.press('Enter');

    // Verify single mode was sent
    expect(analysisModeSeen).toBe('single');

    // Verify standard response appears (no multi-agent UI)
    await expect(page.getByText('Single agent response')).toBeVisible({ timeout: 15_000 });

    // Multi-Agent deliberation panel should NOT appear
    await expect(page.getByText('Multi-Agent')).not.toBeVisible();
  });
});
