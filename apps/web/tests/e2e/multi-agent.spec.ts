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

test.describe('Multi-Agent Chat', () => {
  test.beforeAll(async () => {
    await ensureTestUser('test@example.com', 'password123');
  });

  test('full mode shows 4 agent progress indicators', async ({ page }) => {
    // 1. Authenticate
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30000 });

    // 2. Mock the multi-agent SSE endpoint
    let requestSeen = false;
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      if (body?.analysisMode && body.analysisMode !== 'single') {
        requestSeen = true;
        // Return a mock SSE stream with progress events + final text
        const sseBody = [
          'data: {"type":"specialists_start","agents":["technical","fundamental","risk","sentiment"]}',
          '',
          'data: {"type":"agent_start","agent":"technical"}',
          '',
          'data: {"type":"agent_done","agent":"technical","opinion":{"agentName":"technical","bias":"bullish","confidence":0.8,"reasoning":"Uptrend","rawData":{},"costUsd":0.01,"latencyMs":1200,"model":"test"}}',
          '',
          'data: {"type":"agent_start","agent":"fundamental"}',
          '',
          'data: {"type":"agent_done","agent":"fundamental","opinion":{"agentName":"fundamental","bias":"bullish","confidence":0.7,"reasoning":"Dovish Fed","rawData":{},"costUsd":0.01,"latencyMs":1500,"model":"test"}}',
          '',
          'data: {"type":"agent_start","agent":"risk"}',
          '',
          'data: {"type":"agent_done","agent":"risk","opinion":{"agentName":"risk","bias":"neutral","confidence":0.5,"reasoning":"Moderate risk","rawData":{"hardVeto":false},"costUsd":0.01,"latencyMs":1000,"model":"test"}}',
          '',
          'data: {"type":"agent_start","agent":"sentiment"}',
          '',
          'data: {"type":"agent_done","agent":"sentiment","opinion":{"agentName":"sentiment","bias":"bullish","confidence":0.6,"reasoning":"Positive news","rawData":{},"costUsd":0.01,"latencyMs":800,"model":"test"}}',
          '',
          'data: {"type":"fusion_start"}',
          '',
          'data: {"type":"fusion_done"}',
          '',
          'data: {"type":"text","text":"**Bottom Line:** XAUUSD is bullish with moderate confidence."}',
          '',
          'data: {"type":"metadata","data":{"mode":"full","totalCostUsd":0.05,"totalLatencyMs":5000}}',
          '',
          'data: [DONE]',
          '',
        ].join('\n');
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
          body: sseBody,
        });
      } else {
        // Single-agent fallback mock
        route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'x-vercel-ai-data-stream': 'v1' },
          body: '0:"Mock AI response"\n',
        });
      }
    });

    // 3. Select "Full" mode from the toolbar
    // Click the analysis mode button (has Brain icon + aria-label)
    await page.click('button[aria-label="Analysis mode"]');
    // Click "Full" option in the dropdown
    await page.click('button[role="menuitem"]:has-text("Full")');

    // 4. Send a message
    await page.fill('textarea', 'Should I buy XAUUSD now?');
    await page.press('textarea', 'Enter');

    // 5. Verify the request was sent with analysisMode=full
    expect(requestSeen).toBe(true);

    // 6. Verify the agent deliberation UI appears (progress chips)
    await expect(page.locator('text=Multi-Agent')).toBeVisible({ timeout: 15000 });

    // 7. Verify the final response text appears
    await expect(page.locator('text=Bottom Line')).toBeVisible({ timeout: 15000 });
  });

  test('quick mode only shows Technical agent', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30000 });

    let modeSeen = '';
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      if (body?.analysisMode) modeSeen = body.analysisMode;

      const sseBody = [
        'data: {"type":"specialists_start","agents":["technical"]}',
        '',
        'data: {"type":"agent_start","agent":"technical"}',
        '',
        'data: {"type":"agent_done","agent":"technical","opinion":{"agentName":"technical","bias":"bullish","confidence":0.85,"reasoning":"Strong uptrend","rawData":{},"costUsd":0.01,"latencyMs":900,"model":"test"}}',
        '',
        'data: {"type":"fusion_start"}',
        '',
        'data: {"type":"fusion_done"}',
        '',
        'data: {"type":"text","text":"**Bottom Line:** Quick technical read — bullish."}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: sseBody,
      });
    });

    // Select "Quick" mode
    await page.click('button[aria-label="Analysis mode"]');
    await page.click('button[role="menuitem"]:has-text("Quick")');

    // Send a message
    await page.fill('textarea', "What's the price of gold?");
    await page.press('textarea', 'Enter');

    // Verify the mode was sent
    expect(modeSeen).toBe('quick');

    // Verify response appears
    await expect(page.locator('text=Quick technical read')).toBeVisible({ timeout: 15000 });
  });

  test('single mode uses standard chat (no multi-agent)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/chat.*/, { timeout: 30000 });

    let analysisModeSeen: string | undefined = undefined;
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      analysisModeSeen = body?.analysisMode;
      // Standard AI SDK stream format
      route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'x-vercel-ai-data-stream': 'v1' },
        body: '0:"Single agent response"\n',
      });
    });

    // Select "Single" mode
    await page.click('button[aria-label="Analysis mode"]');
    await page.click('button[role="menuitem"]:has-text("Single")');

    // Send a message
    await page.fill('textarea', 'Hello');
    await page.press('textarea', 'Enter');

    // Verify single mode was sent
    expect(analysisModeSeen).toBe('single');

    // Verify standard response appears (no multi-agent UI)
    await expect(page.locator('text=Single agent response')).toBeVisible({ timeout: 15000 });
    // Multi-Agent deliberation panel should NOT appear
    await expect(page.locator('text=Multi-Agent')).not.toBeVisible();
  });
});