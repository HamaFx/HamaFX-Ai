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

import { createThread, deleteThread } from '@kestrel/ai/persistence';
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

  // Match only the exact chat endpoint. A broader `**/api/chat` glob also
  // intercepts `/api/chat/threads/fork` (and other sub-routes), which would
  // swallow the fork request and return a chat stream instead of the fork
  // JSON response.
  await page.route(/\/api\/chat(?:\?.*)?$/, (route) => {
    let body: { analysisMode?: string } | undefined;
    try {
      body = route.request().postDataJSON() as { analysisMode?: string };
    } catch {
      // A malformed request is still given the deterministic mock response;
      // the UI test is validating rendering, not request serialization.
    }
    const isMultiAgent = body?.analysisMode && body.analysisMode !== 'single';

    if (isMultiAgent && multiAgentBody) {
      route.fulfill({
        status,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: multiAgentBody,
      });
    } else {
      const text = extractMockText(singleAgentBody);
      route.fulfill({
        status,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: [
          `data: ${JSON.stringify({ type: 'text-start', id: TEST_MESSAGE_ID })}`,
          '',
          `data: ${JSON.stringify({ type: 'text-delta', id: TEST_MESSAGE_ID, delta: text })}`,
          '',
          `data: ${JSON.stringify({ type: 'text-end', id: TEST_MESSAGE_ID })}`,
          '',
        ].join('\n'),
      });
    }
  });
}

function extractMockText(dataStream: string): string {
  const firstTextPart = dataStream.match(/^0:(.*)$/m)?.[1]?.trim();
  if (!firstTextPart) return dataStream;
  try {
    return JSON.parse(firstTextPart) as string;
  } catch {
    return dataStream;
  }
}

// ---------------------------------------------------------------------------
// Multi-agent SSE mock bodies — current ChatStreamEventSchema protocol.
// ---------------------------------------------------------------------------

// The message id becomes the persisted assistant message id, and the fork
// flow validates it as a UUID server-side. A literal non-UUID id makes
// editing/forking fail with a 400, so generate a real UUID per mock.
const TEST_MESSAGE_ID = crypto.randomUUID();

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

export const STANDARD_MODE_SSE = [
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done","opinion":{"agentName":"technical","bias":"bullish","confidence":0.8,"reasoning":"Uptrend"}},{"agentName":"fundamental","status":"done","opinion":{"agentName":"fundamental","bias":"bullish","confidence":0.7,"reasoning":"Macro supportive"}}],"mode":"standard"}}',
  '',
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"**Bottom Line:** Standard technical and fundamental read — bullish."}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
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

export const SINGLE_MODE_SSE = [
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"Single agent response"}`,
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
    // The storageState is already loaded via the project config. Create a
    // dedicated empty thread so tests do not depend on auth-setup or another
    // test's most-recent-thread state.
    const user = await ensureTestUser('test@example.com', 'password123');
    const thread = await createThread(user.id, { pinnedSymbol: null });

    // Specs commonly navigate to `/chat`, whose server redirect chooses the
    // user's latest thread. Parallel tests share the seeded user, so that
    // redirect can select another worker's thread just before its teardown.
    // Keep landing-page navigation isolated while leaving explicit thread
    // routes (`/chat/{id}`) and `/api/chat*` API requests unchanged. The
    // regex anchors the path end so `/api/chat/threads/fork` is untouched.
    await page.route(/\/chat(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      // Never rewrite API paths: `/api/chat` ends in `/chat` but must reach
      // the mock/real route, not the landing redirect.
      if (url.pathname.startsWith('/api/')) {
        await route.continue();
        return;
      }
      url.pathname = `/chat/${thread.id}`;
      await route.continue({ url: url.toString() });
    });

    await page.goto(`/chat/${thread.id}`);
    await use(page);
    await deleteThread(user.id, thread.id).catch(() => undefined);
  },

  mockChatApi: async ({}, use) => {
    await use(mockChatApi);
  },
});

export { expect };
