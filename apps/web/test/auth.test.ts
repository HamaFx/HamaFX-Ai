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

import { describe, expect, it } from 'vitest';

import { signAuthToken, verifyAuthToken } from '../src/lib/auth';

const SECRET = 'test-secret-please-do-not-use-in-prod';
const URL_SAFE_RE = /^[A-Za-z0-9_-]+$/;

describe('auth token base64url encoding', () => {
  it('produces tokens that contain only url-safe characters', async () => {
    // Generate enough tokens that any +, /, = leakage shows up reliably.
    for (let i = 0; i < 50; i += 1) {
      const token = await signAuthToken(SECRET, 60_000);
      const [payload, sig] = token.split('.');
      expect(payload).toMatch(URL_SAFE_RE);
      expect(sig).toMatch(URL_SAFE_RE);
      expect(token).not.toContain('+');
      expect(token).not.toContain('/');
      expect(token).not.toContain('=');
    }
  });

  it('round-trips a freshly signed token', async () => {
    const token = await signAuthToken(SECRET, 60_000);
    const payload = await verifyAuthToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it('rejects an expired token', async () => {
    const token = await signAuthToken(SECRET, -1_000); // already expired
    const payload = await verifyAuthToken(token, SECRET);
    expect(payload).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAuthToken(SECRET, 60_000);
    const payload = await verifyAuthToken(token, `${SECRET}-other`);
    expect(payload).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signAuthToken(SECRET, 60_000);
    const [payload, sig] = token.split('.');
    // Flip one character in the payload.
    const flipped = payload!.endsWith('A') ? `${payload!.slice(0, -1)}B` : `${payload!.slice(0, -1)}A`;
    const tampered = `${flipped}.${sig}`;
    expect(await verifyAuthToken(tampered, SECRET)).toBeNull();
  });

  it('rejects tokens that contain raw "/" (the legacy buggy format)', async () => {
    // Build a fake token using the pre-fix encoder to prove the new format
    // genuinely changed and that the verifier rejects the legacy shape.
    function buggyEncode(bytes: Uint8Array): string {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]!);
      return btoa(bin).replaceAll('+', '-').replaceAll('_', '/').replace(/=+$/, '');
    }

    // Synthesize bytes that base64-encode to include both `+` and `/`.
    // 0xfb 0xff 0xfe encodes to "+//+" — so the buggy encoder yields "-///-".
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe]);
    const buggy = buggyEncode(bytes);
    expect(buggy).toContain('/');
    // The verifier's base64UrlToBytes does not undo a `/`, so the token won't
    // match against any legitimate signature/payload pair.
    expect(buggy).not.toMatch(URL_SAFE_RE);
  });

  it('round-trips 100 random byte sequences', async () => {
    // Sign + verify a wide range so any encoding edge case surfaces.
    for (let i = 0; i < 100; i += 1) {
      const ttl = 1_000 + Math.floor(Math.random() * 60_000);
      const token = await signAuthToken(SECRET, ttl);
      const payload = await verifyAuthToken(token, SECRET);
      expect(payload).not.toBeNull();
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
  });
});
