// SPDX-License-Identifier: Apache-2.0

// Verifies the NextAuth v5 wiring is real, not a stub.
// The previous stub returned a hardcoded `__system__` user and exported
// no-op signIn/signOut. This test fails loudly if those come back.
//
// `vi.hoisted` runs before the imports below, ensuring process.env is
// populated before `getDb()` is evaluated in `../src/auth`.
//
// We do NOT call `auth()` here — that requires Next.js's request scope
// (cookies/headers), which doesn't exist in a bare vitest run. End-to-end
// auth behaviour is covered by the integration test in auth-flow.test.ts.

import { vi } from 'vitest';

vi.hoisted(() => {
  // The real auth.ts evaluates `DrizzleAdapter(getDb())` at module load.
  // `getDb()` reads DATABASE_URL — a placeholder is fine; the test never
  // opens a real connection.
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.NEXTAUTH_SECRET ??= 'test-secret-must-be-at-least-32-chars-long';
  process.env.CRON_SECRET ??= 'test-cron-secret-16-chars-min';
});

import { describe, expect, it } from 'vitest';
import { handlers, signIn, signOut } from '../src/auth';

describe('NextAuth wiring', () => {
  it('exports real auth handlers (GET + POST)', () => {
    expect(handlers).toBeDefined();
    expect(handlers.GET).toBeTypeOf('function');
    expect(handlers.POST).toBeTypeOf('function');
  });

  it('exports real signIn and signOut (not no-op stubs)', () => {
    expect(signIn).toBeTypeOf('function');
    expect(signOut).toBeTypeOf('function');
    // The stubs were empty `async (...args) => {}`. The real NextAuth
    // factory returns curried wrappers — even a single-line wrapper is
    // 60+ chars. A body shorter than that means the stub came back.
    expect(signIn.toString().length).toBeGreaterThan(50);
    expect(signOut.toString().length).toBeGreaterThan(50);
  });

  it('auth.ts imports the real NextAuth factory, not a custom stub', async () => {
    // Read the source as a sanity check that we didn't accidentally
    // re-introduce the stub form. Belt-and-braces alongside the runtime
    // shape checks above.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../src/auth.ts', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/NextAuth\(/);
    expect(src).toMatch(/Credentials\(/);
    expect(src).toMatch(/getDb\(/);
    expect(src).not.toMatch(/__system__/);
  });
});
