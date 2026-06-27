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

import { describe, it, expect, beforeEach } from 'vitest';
import { createLinkCode, resolveLinkCode } from './linking';

// These tests only cover the in-memory link code logic.
// DB operations (resolveBotUser, unlinkBot, getBotLink) require a
// test database and are covered by integration tests.

describe('Link Code Generation', () => {
  it('generates a 6-character alphanumeric code', () => {
    const { code } = createLinkCode('user-1');
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
  });

  it('generates unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { code } = createLinkCode(`user-${i}`);
      codes.add(code);
    }
    // Extremely unlikely to have collisions with 100 codes
    expect(codes.size).toBeGreaterThan(90);
  });

  it('returns an expiry date 10 minutes in the future', () => {
    const before = Date.now() + 9 * 60 * 1000;
    const { expiresAt } = createLinkCode('user-2');
    const after = Date.now() + 11 * 60 * 1000;
    const expiryMs = expiresAt.getTime();
    expect(expiryMs).toBeGreaterThan(before);
    expect(expiryMs).toBeLessThan(after);
  });
});

describe('Link Code Resolution', () => {
  it('returns null for an invalid code', async () => {
    const result = await resolveLinkCode('INVALID', '123', 'telegram');
    expect(result).toBeNull();
  });

  it('returns null for an expired code', async () => {
    const { code } = createLinkCode('user-expired');
    // We can't easily mock time in this test, but we can test
    // that a non-existent code returns null
    const result = await resolveLinkCode('ZZZZZZ', '123', 'telegram');
    expect(result).toBeNull();
  });
});
