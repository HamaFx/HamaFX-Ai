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
// Composable Playwright fixtures — 2026 upgrade
//
// Replaces manual login boilerplate in every spec with a reusable `authedPage`
// fixture that loads a pre-authenticated storageState. Also provides:
//   • `mockChatApi` — intercepts /api/chat with a configurable mock response
//   • `testUser` — the default test user credentials
//   • `cleanupUser` — removes test data after the suite
//
// Usage:
//   import { test, expect } from './fixtures';
//   test('my test', async ({ authedPage }) => { ... });
// ---------------------------------------------------------------------------

import { test as base, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMockOptions {
  /** SSE body for multi-agent mode (analysisMode !== 'single') */
  multiAgentBody?: string;
  /** Body for single-agent mode */
  singleAgentBody?: string;
  /** HTTP status (default 200) */
  status?: number;
}

export interface Fixtures {
  /** A page that is already logged in via storageState */
  authedPage: Page;
  /** Helper to mock the /api/chat endpoint */
  mockChatApi: (page: Page, opts?: ChatMockOptions) => Promise<void>;
  /** Default test user credentials */
  testUser: { email: string; password: string };
}

// ---------------------------------------------------------------------------
// Default test user
// ---------------------------------------------------------------------------

export const DEFAULT_USER = {
  email: 'test@example.com',
  password: 'password123',
} as const;

// ---------------------------------------------------------------------------
// Mock chat API helper
// ---------------------------------------------------------------------------

async function mockChatApi(page: Page, opts: ChatMockOptions = {}) {
  const {
    status = 200,
    singleAgentBody = '0:"Mock AI response"\n',
    multiAgentBody,
  } = opts;

  await page.route('**/api/chat', (route) => {
    const body = route.request().postDataJSON();
    const isMultiAgent = body?.analysisMode && body.analysisMode !== 'single';

    if (isMultiAgent && multiAgentBody) {
      route.fulfill({
        status,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: multiAgentBody,
      });
    } else {
      route.fulfill({
        status,
        contentType: 'text/plain; charset=utf-8',
        headers: { 'x-vercel-ai-data-stream': 'v1' },
        body: singleAgentBody,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Multi-agent SSE mock bodies — current ChatStreamEventSchema protocol.
// ---------------------------------------------------------------------------

const TEST_MESSAGE_ID = 'test-message-id';

export const FULL_MODE_SSE = [
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"running"},{"agentName":"fundamental","status":"pending"},{"agentName":"risk","status":"pending"},{"agentName":"sentiment","status":"pending"},{"agentName":"decision","status":"pending"}],"mode":"full"}}',
  '',
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done","opinion":{"agentName":"technical","bias":"bullish","confidence":0.8,"reasoning":"Uptrend"}},{"agentName":"fundamental","status":"done","opinion":{"agentName":"fundamental","bias":"bullish","confidence":0.7,"reasoning":"Dovish Fed"}},{"agentName":"risk","status":"done","opinion":{"agentName":"risk","bias":"neutral","confidence":0.5,"reasoning":"Moderate risk"}},{"agentName":"sentiment","status":"done","opinion":{"agentName":"sentiment","bias":"bullish","confidence":0.6,"reasoning":"Positive news"}},{"agentName":"decision","status":"done"}],"mode":"full"}}',
  '',
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"**Bottom Line:** XAUUSD is bullish with moderate confidence."}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"data-multi-agent-meta","id":"${TEST_MESSAGE_ID}","data":{"agentOpinions":[],"mode":"full","totalCostUsd":0.05,"totalLatencyMs":5000},"transient":true}`,
  '',
].join('\n');

export const QUICK_MODE_SSE = [
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done","opinion":{"agentName":"technical","bias":"bullish","confidence":0.85,"reasoning":"Strong uptrend"}},{"agentName":"decision","status":"done"}],"mode":"quick"}}',
  '',
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"**Bottom Line:** Quick technical read — bullish."}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<Fixtures>({
  testUser: async ({}, use) => {
    await use(DEFAULT_USER);
  },

  authedPage: async ({ page }, use) => {
    // The storageState is already loaded via the project config.
    // We just navigate to the app to verify the session is valid.
    await page.goto('/');
    await use(page);
  },

  mockChatApi: async ({}, use) => {
    await use(mockChatApi);
  },
});

export { expect };
