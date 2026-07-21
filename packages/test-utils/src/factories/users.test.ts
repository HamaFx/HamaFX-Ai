import { describe, expect, it, beforeEach } from 'vitest';
import { makeUser, makeSession, resetUserCounter } from './users';

describe('makeUser', () => {
  beforeEach(() => {
    resetUserCounter();
  });

  it('creates a user with auto-incrementing id and sensible defaults', () => {
    const user = makeUser();
    expect(user.id).toBe('test-user-1');
    expect(user.name).toBe('Test User 1');
    expect(user.email).toBe('testuser1@example.com');
    expect(user.role).toBe('user');
  });

  it('increments the counter across multiple calls', () => {
    const u1 = makeUser();
    const u2 = makeUser();
    expect(u1.id).toBe('test-user-1');
    expect(u2.id).toBe('test-user-2');
  });

  it('accepts partial overrides', () => {
    const user = makeUser({ id: 'custom-id', name: 'Alice', role: 'admin' });
    expect(user.id).toBe('custom-id');
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('admin');
    expect(user.email).toBe('testuser1@example.com'); // auto-generated
  });

  it('accepts all overrides', () => {
    const user = makeUser({
      id: 'u1',
      name: 'Bob',
      email: 'bob@test.com',
      role: 'user',
    });
    expect(user).toEqual({
      id: 'u1',
      name: 'Bob',
      email: 'bob@test.com',
      role: 'user',
    });
  });
});

describe('makeSession', () => {
  it('creates a session object for a given userId', () => {
    const session = makeSession('user-abc');
    expect(session.user.id).toBe('user-abc');
    expect(session.user.name).toBe('Test User');
    expect(session.user.role).toBe('user');
    expect(session.expires).toBeDefined();
    // Session should expire ~24h from now
    const expires = new Date(session.expires).getTime();
    const now = Date.now();
    expect(expires).toBeGreaterThan(now);
    expect(expires - now).toBeLessThan(86_500_000); // ~24h + small tolerance
  });

  it('uses the userId in email generation', () => {
    const session = makeSession('abc123');
    expect(session.user.email).toBe('testuser-abc123@example.com');
  });
});

describe('resetUserCounter', () => {
  beforeEach(() => {
    // Start from a clean state
    resetUserCounter();
  });

  it('resets the counter back to 0', () => {
    makeUser();
    makeUser();
    const third = makeUser();
    expect(third.id).toBe('test-user-3');

    resetUserCounter();
    const afterReset = makeUser();
    expect(afterReset.id).toBe('test-user-1');
  });
});
