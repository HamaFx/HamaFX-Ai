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

/**
 * Regression test for the Phase D bug where `testProviderKey` would
 * return `{ ok: true }` for any well-formed string without contacting
 * the provider. Root cause was that the OpenAI-compatible shim factory
 * is a no-op local construction — it stores the key and returns a
 * builder without making a network call. The fix: actually call the
 * provider with `generateText({ maxOutputTokens: 1 })`.
 *
 * We mock `generateText` from `ai` so this test runs offline:
 *   - First test: mock throws → expect `ok: false`
 *   - Second test: mock resolves → expect `ok: true`
 *
 * The mocking strategy uses the package's `vi.mock` for ESM
 * compatibility; the `vertex` provider is excluded since it has its
 * own dedicated test file (vertex-byok.test.ts).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// model.ts pulls in @hamafx/shared/encryption, which itself imports
// 'server-only' (throws at import time outside a server runtime). We
// stub the encryption module instead, mirroring the pattern in
// override-model.test.ts.
vi.mock('@hamafx/shared/encryption', () => ({
  PROVIDER_IDS: [
    'google',
    'vertex',
    'anthropic',
    'openai',
    'groq',
    'mistral',
    'openrouter',
    'xai',
    'deepseek',
  ],
  decryptByok: () => null,
  encryptByok: () => '',
  configuredProviders: () => new Set(),
}));

// Mock the AI SDK's generateText so we don't hit the network.
const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

// model.ts pulls in @hamafx/db (for telemetry + schema lookups).
// We stub the schema access so importing the module doesn't try
// to connect to Postgres.
vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
  }),
  schema: {
    chatTelemetry: {},
    chatMessages: {},
  },
}));

import { testProviderKey } from '../src/model';

describe('testProviderKey — actually contacts the provider', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it('returns ok=false when generateText throws (e.g. wrong key)', async () => {
    // Simulate an upstream 401 from Mistral/OpenAI etc.
    const apiError = new Error('Provider API error: 401 Unauthorized') as Error & {
      statusCode?: number;
    };
    apiError.statusCode = 401;
    generateTextMock.mockRejectedValueOnce(apiError);

    // 30+ char opaque key passes the min-length floor
    const result = await testProviderKey(
      'mistral',
      'msk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The status code should be lifted into the user-facing message.
      expect(result.error).toContain('401');
      expect(result.error.toLowerCase()).toContain('unauthorized');
    }
    expect(generateTextMock).toHaveBeenCalledOnce();
  });

  it('returns ok=true when generateText resolves', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'ok' });

    const result = await testProviderKey(
      'openai',
      'sk-abcdefghijklmnopqrstuvwxyz1234567890',
    );
    expect(result.ok).toBe(true);
    expect(generateTextMock).toHaveBeenCalledOnce();
    // The prompt should be tiny (maxOutputTokens: 1) — confirm we
    // asked for the right shape, since the call is what's actually
    // costing the user.
    const callArgs = generateTextMock.mock.calls[0]?.[0] as {
      prompt: string;
      maxOutputTokens: number;
    };
    expect(callArgs.maxOutputTokens).toBe(1);
    expect(typeof callArgs.prompt).toBe('string');
  });

  it('returns ok=false with a friendly message on network error', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await testProviderKey(
      'groq',
      'gsk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Plain Error path — no statusCode → just the extracted message.
      expect(result.error).toContain('fetch failed');
    }
  });
});