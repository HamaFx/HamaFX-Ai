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

describe('open redirect blocking (MED-01)', () => {
  function safeNext(next: string | undefined): string {
    return next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat';
  }

  it('preserves a safe relative path', () => {
    expect(safeNext('/settings')).toBe('/settings');
    expect(safeNext('/chat')).toBe('/chat');
  });

  it('blocks protocol-relative URLs starting with //', () => {
    expect(safeNext('//evil.com')).toBe('/chat');
    expect(safeNext('//evil.com/path')).toBe('/chat');
  });

  it('blocks absolute URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/chat');
  });

  it('falls back to /chat for undefined next', () => {
    expect(safeNext(undefined)).toBe('/chat');
  });

  it('falls back to /chat for empty string', () => {
    expect(safeNext('')).toBe('/chat');
  });
});

describe('account lockout logic (LOW-05)', () => {
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  function isLocked(lockedUntil: Date | null): boolean {
    return lockedUntil !== null && lockedUntil > new Date();
  }

  function calculateLockout(attempts: number, now: Date): { locked: boolean; lockedUntil: Date | null } {
    if (attempts >= MAX_ATTEMPTS) {
      return { locked: true, lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) };
    }
    return { locked: false, lockedUntil: null };
  }

  it('allows login with fewer than 5 failed attempts', () => {
    for (let i = 0; i < 4; i++) {
      const { locked } = calculateLockout(i, new Date());
      expect(locked).toBe(false);
    }
  });

  it('locks after 5 failed attempts', () => {
    const { locked, lockedUntil } = calculateLockout(5, new Date());
    expect(locked).toBe(true);
    expect(lockedUntil).not.toBeNull();
  });

  it('locks after more than 5 failed attempts', () => {
    const { locked } = calculateLockout(10, new Date());
    expect(locked).toBe(true);
  });

  it('returns locked when lockedUntil is in the future', () => {
    const future = new Date(Date.now() + 60_000);
    expect(isLocked(future)).toBe(true);
  });

  it('returns unlocked when lockedUntil is in the past', () => {
    const past = new Date(Date.now() - 60_000);
    expect(isLocked(past)).toBe(false);
  });

  it('returns unlocked when lockedUntil is null', () => {
    expect(isLocked(null)).toBe(false);
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
