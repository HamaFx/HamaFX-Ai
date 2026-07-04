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
import { ensureTestUser } from './test-utils';

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
// Multi-agent SSE mock body (full mode — 4 agents)
// ---------------------------------------------------------------------------

export const FULL_MODE_SSE = [
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

// ---------------------------------------------------------------------------
// Quick mode SSE mock (technical only)
// ---------------------------------------------------------------------------

export const QUICK_MODE_SSE = [
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
