// Verifies the NextAuth v5 wiring is real, not a stub.
// The previous stub returned a hardcoded `__system__` user and exported
// no-op signIn/signOut. This test fails loudly if those come back.

import { describe, expect, it } from 'vitest';
import { auth, handlers, signIn, signOut } from '../src/auth';

describe('NextAuth wiring', () => {
  it('exports real auth handlers (GET + POST)', () => {
    expect(handlers).toBeDefined();
    expect(handlers.GET).toBeTypeOf('function');
    expect(handlers.POST).toBeTypeOf('function');
  });

  it('exports real signIn and signOut (not no-op stubs)', () => {
    expect(signIn).toBeTypeOf('function');
    // The stub was `async (...args: any[]) => {}` — a literal empty body.
    // The real NextAuth signIn carries a real implementation, so its
    // serialised source is non-trivial.
    expect(signIn.toString().length).toBeGreaterThan(100);
    expect(signOut).toBeTypeOf('function');
    expect(signOut.toString().length).toBeGreaterThan(100);
  });

  it('auth() returns null when there is no session cookie', async () => {
    // The stub always returned a hardcoded __system__ user. The real
    // NextAuth auth() with the jwt strategy returns null in a test
    // environment with no cookies set.
    const result = await auth();
    expect(result).toBeNull();
  });
});
