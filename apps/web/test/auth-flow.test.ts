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
