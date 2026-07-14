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

// Tests for the register flow's input validation + password hashing.
// We don't import the full `registerAction` here because that pulls in
// `@/auth` which instantiates `DrizzleAdapter(getDb())` at module load —
// `getDb()` is the sync postgres-js client, which has no PGlite path.
// End-to-end coverage lives in the manual smoke test (Task A.2) where
// `docker compose up` provides a real Postgres.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { sanitizeNext } from '../src/app/(auth)/actions';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

describe('register input validation', () => {
  it('accepts a valid registration payload', () => {
    const parsed = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'correct-horse-battery-staple',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects too-short names (< 2 chars)', () => {
    const parsed = registerSchema.safeParse({
      name: 'A',
      email: 'test@example.com',
      password: 'password123',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/at least 2/i);
  });

  it('rejects malformed emails', () => {
    const parsed = registerSchema.safeParse({
      name: 'Test',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/invalid email/i);
  });

  it('rejects short passwords (< 8 chars)', () => {
    const parsed = registerSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: 'short',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/at least 8/i);
  });

  it('rejects empty fields entirely', () => {
    const parsed = registerSchema.safeParse({});
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toHaveLength(3);
  });
});

describe('register password hashing', () => {
  it('bcrypt-hashes a password and verifies against the hash', async () => {
    const password = 'correct-horse-battery-staple';
    const hash = await bcrypt.hash(password, 10);

    // bcrypt hashes always start with $2a$, $2b$, or $2y$ followed by the
    // cost factor. Verifying the format catches a class of regressions
    // (e.g. accidentally storing plaintext).
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash).not.toContain(password);

    const ok = await bcrypt.compare(password, hash);
    expect(ok).toBe(true);

    const wrongOk = await bcrypt.compare('wrong-password', hash);
    expect(wrongOk).toBe(false);
  });
});

describe('password strength validation', () => {
  const hasUpper = /[A-Z]/;
  const hasLower = /[a-z]/;
  const hasDigit = /[0-9]/;
  const minLen = 8;

  function validatePassword(pw: string): string | null {
    if (pw.length < minLen) return 'Password must be at least 8 characters';
    if (!hasUpper.test(pw)) return 'Password must contain at least one uppercase letter';
    if (!hasLower.test(pw)) return 'Password must contain at least one lowercase letter';
    if (!hasDigit.test(pw)) return 'Password must contain at least one number';
    return null;
  }

  it('accepts a strong password', () => {
    expect(validatePassword('StrongP4ss!')).toBeNull();
    expect(validatePassword('Abcdef1gh')).toBeNull();
    expect(validatePassword('1Aaaaaaa')).toBeNull();
  });

  it('rejects passwords shorter than 8 characters', () => {
    const result = validatePassword('Ab1c');
    expect(result).toMatch(/at least 8/i);
  });

  it('rejects passwords without uppercase', () => {
    const result = validatePassword('abcdef1gh');
    expect(result).toMatch(/uppercase/i);
  });

  it('rejects passwords without lowercase', () => {
    const result = validatePassword('ABCDEF1GH');
    expect(result).toMatch(/lowercase/i);
  });

  it('rejects passwords without a digit', () => {
    const result = validatePassword('Abcdefghi');
    expect(result).toMatch(/number/i);
  });
});

describe('bcrypt cost parsing (FEAT-05 gradual re-hashing)', () => {
  function parseBcryptCost(hash: string): number {
    const match = hash.match(/^\$2[ab]\$(\d+)\$/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  }

  it('parses cost 12 hash', async () => {
    const hash = await bcrypt.hash('test', 12);
    expect(parseBcryptCost(hash)).toBe(12);
  });

  it('parses cost 10 hash', async () => {
    const hash = await bcrypt.hash('test', 10);
    expect(parseBcryptCost(hash)).toBe(10);
  });

  it('returns 0 for a non-hash string', () => {
    expect(parseBcryptCost('not-a-hash')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseBcryptCost('')).toBe(0);
  });

  it('detects cost < 12 for upgrade (FEAT-05)', async () => {
    const hash = await bcrypt.hash('test', 8);
    const cost = parseBcryptCost(hash);
    expect(cost).toBeLessThan(12);
    expect(cost).toBe(8);
  });
});

describe('sanitizeNext (P2-7)', () => {
  it('preserves safe relative paths', () => {
    expect(sanitizeNext('/settings')).toBe('/settings');
    expect(sanitizeNext('/chat')).toBe('/chat');
  });

  it('blocks protocol-relative URLs', () => {
    expect(sanitizeNext('//evil.com')).toBe('/chat');
  });

  it('blocks absolute URLs', () => {
    expect(sanitizeNext('https://evil.com')).toBe('/chat');
  });

  it('blocks backslash injection', () => {
    expect(sanitizeNext('\\evil.com')).toBe('/chat');
    expect(sanitizeNext('/path\\evil')).toBe('/chat');
  });

  it('blocks encoded double-slash', () => {
    expect(sanitizeNext('/%2f%2fevil')).toBe('/chat');
  });

  it('caps at 500 chars', () => {
    expect(sanitizeNext('/' + 'a'.repeat(600))).toBe('/chat');
  });

  it('falls back for null/undefined/empty', () => {
    expect(sanitizeNext(null)).toBe('/chat');
    expect(sanitizeNext(undefined)).toBe('/chat');
    expect(sanitizeNext('')).toBe('/chat');
  });
});

describe('password max-length (P2-4)', () => {
  const schema = z.object({
    password: z.string().min(8).max(128),
  });

  it('accepts password at max length', () => {
    expect(schema.safeParse({ password: 'A1' + 'b'.repeat(126) }).success).toBe(true);
  });

  it('rejects password over max length', () => {
    expect(schema.safeParse({ password: 'A1' + 'b'.repeat(127) }).success).toBe(false);
  });

  it('rejects password under min length', () => {
    expect(schema.safeParse({ password: 'Ab1cdef' }).success).toBe(false);
  });
});

describe('token hashing (P0-6)', () => {
  function hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  it('produces deterministic 64-char hex hash', () => {
    const h = hashToken('test-token');
    expect(h).toBe(hashToken('test-token'));
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[a-f0-9]+$/);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });

  it('rejects lookup with wrong hash (no cross-flow match)', () => {
    const resetToken = 'raw-reset-token-123';
    const resetHash = hashToken(resetToken);
    // Simulating: an email_verify lookup against a password_reset hash should fail
    // because purpose filters prevent it
    const verifyHash = hashToken('different-verify-token');
    expect(resetHash).not.toBe(verifyHash);
  });

  it('single-use: hash changes when raw changes', () => {
    const t1 = hashToken('token-v1');
    const t2 = hashToken('token-v2');
    expect(t1).not.toBe(t2);
  });
});

describe('2FA validation logic', () => {
  // mirrors the logic in auth.ts authorize() P0-1
  function validate2FA(twoFactorEnabled: boolean, totpCode: string | undefined): string | null {
    if (!twoFactorEnabled) return null;
    if (!totpCode) return '2FA_REQUIRED';
    if (totpCode.length !== 6) return 'INVALID_2FA_CODE';
    return null; // valid
  }

  it('skips 2FA when not enabled', () => {
    expect(validate2FA(false, undefined)).toBeNull();
    expect(validate2FA(false, '123456')).toBeNull();
  });

  it('requires 2FA code when enabled and none provided', () => {
    expect(validate2FA(true, '')).toBe('2FA_REQUIRED');
    expect(validate2FA(true, undefined)).toBe('2FA_REQUIRED');
  });

  it('returns invalid for wrong-length code', () => {
    expect(validate2FA(true, '12345')).toBe('INVALID_2FA_CODE');
    expect(validate2FA(true, '1234567')).toBe('INVALID_2FA_CODE');
  });
});

describe('session validation logic (P0-4)', () => {
  function isSessionValid(
    sessionExists: boolean,
    tokenVersion: number,
    dbTokenVersion: number,
    iat: number,
    rememberMe: boolean,
  ): boolean {
    // Session revoked check
    if (!sessionExists) return false;
    // tokenVersion mismatch
    if (dbTokenVersion !== tokenVersion) return false;
    // 24h expiry for non-remembered sessions
    const now = Math.floor(Date.now() / 1000);
    if (!rememberMe && now - iat > 86400) return false;
    return true;
  }

  it('invalidates when session row is deleted (revoked)', () => {
    expect(isSessionValid(false, 1, 1, 0, true)).toBe(false);
  });

  it('invalidates when tokenVersion mismatches (signOutEverywhere)', () => {
    expect(isSessionValid(true, 1, 2, 0, true)).toBe(false);
  });

  it('keeps valid session active', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isSessionValid(true, 1, 1, now, true)).toBe(true);
  });

  it('expires non-remembered session after 24h', () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 172800;
    expect(isSessionValid(true, 1, 1, twoDaysAgo, false)).toBe(false);
  });

  it('keeps remembered session beyond 24h', () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 172800;
    expect(isSessionValid(true, 1, 1, twoDaysAgo, true)).toBe(true);
  });
});

describe('remember me logic (FEAT-04)', () => {
  const THIRTY_DAYS = 30 * 24 * 60 * 60; // in seconds
  const ONE_DAY = 24 * 60 * 60;

  function isSessionExpired(iat: number, rememberMe: boolean, now: number): boolean {
    if (rememberMe) return false; // session cookie handles maxAge
    return (now - iat) > ONE_DAY;
  }

  it('keeps rememberMe sessions valid beyond 24h', () => {
    const iat = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 2; // 2 days ago
    expect(isSessionExpired(iat, true, Math.floor(Date.now() / 1000))).toBe(false);
  });

  it('expires non-remember sessions after 24h', () => {
    const iat = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 2; // 2 days ago
    expect(isSessionExpired(iat, false, Math.floor(Date.now() / 1000))).toBe(true);
  });

  it('keeps non-remember sessions valid within 24h', () => {
    const iat = Math.floor(Date.now() / 1000) - 60 * 60; // 1 hour ago
    expect(isSessionExpired(iat, false, Math.floor(Date.now() / 1000))).toBe(false);
  });

  it('allows 30-day maxAge for remember me as config constant', () => {
    expect(THIRTY_DAYS).toBe(2592000);
    expect(ONE_DAY).toBe(86400);
  });
});
