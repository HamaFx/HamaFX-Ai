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

// Plan 03 §5 — Unit tests for provisionUserOnSignIn.
// Mocks the DB layer to verify provisioning and account-linking logic
// without needing a real Postgres.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// ── Mock DB state ──────────────────────────────────────────────────────

let mockSelectResult: unknown[] = [];
let insertedUsers: unknown[] = [];
let insertedSettings: unknown[] = [];
let insertedAccounts: unknown[] = [];
let updatedUsers: Array<{ id: string; data: Record<string, unknown> }> = [];

function mockDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mockSelectResult),
        }),
      }),
    }),
    insert: (table: unknown) => {
      const tableStr = String(table);
      return {
        values: (data: unknown) => {
          if (tableStr.includes('users')) insertedUsers.push(data);
          else if (tableStr.includes('user_settings') || tableStr.includes('userSettings'))
            insertedSettings.push(data);
          else if (tableStr.includes('accounts')) insertedAccounts.push(data);
          return {
            onConflictDoNothing: () => Promise.resolve(),
            returning: () => Promise.resolve([data]),
          };
        },
      };
    },
    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: () => {
          // Extract the userId from the where clause for tracking
          const id = String((data as Record<string, unknown>).emailVerified ?? 'unknown');
          updatedUsers.push({ id, data });
          return Promise.resolve();
        },
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      // The provision function casts tx as unknown as typeof db
      // which means tx IS the same mock — simplified for testing
      const tx = mockDb();
      await fn(tx);
    },
  };
}

vi.mock('@hamafx/ai', () => ({
  getDb: () => mockDb(),
}));

vi.mock('@hamafx/db', () => ({
  schema: {
    users: 'users',
    userSettings: 'userSettings',
    accounts: 'accounts',
  },
}));

// Must be imported after mocks
const { provisionUserOnSignIn } = await vi.importActual<
  typeof import('../src/lib/auth/provision-user')
>('../src/lib/auth/provision-user');

// ── Helpers ────────────────────────────────────────────────────────────

function googleProfile(overrides?: Record<string, unknown>) {
  return {
    email: 'test@example.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    ...overrides,
  };
}

function googleAccount(overrides?: Record<string, unknown>) {
  return {
    provider: 'google',
    providerAccountId: 'google-123',
    type: 'oauth',
    access_token: 'token-abc',
    refresh_token: 'refresh-xyz',
    expires_at: 3600,
    token_type: 'Bearer',
    scope: 'email profile',
    id_token: 'id-token-xyz',
    ...overrides,
  };
}

beforeEach(() => {
  mockSelectResult = [];
  insertedUsers = [];
  insertedSettings = [];
  insertedAccounts = [];
  updatedUsers = [];
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('provisionUserOnSignIn', () => {
  // ── Non-Google providers ──

  it('returns allow:true for non-Google providers (noop)', async () => {
    const result = await provisionUserOnSignIn({
      user: {},
      account: { provider: 'credentials', providerAccountId: 'cred-1', type: 'credentials' },
    });

    expect(result.allow).toBe(true);
    expect(result.userFields).toBeUndefined();
  });

  it('returns allow:true for null account', async () => {
    const result = await provisionUserOnSignIn({
      user: {},
      account: null,
    });

    expect(result.allow).toBe(true);
  });

  // ── Denial paths ──

  it('returns allow:false when email is missing', async () => {
    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: { email_verified: true }, // no email field
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/not verified/i);
  });

  it('returns allow:false when email is not verified', async () => {
    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: googleProfile({ email_verified: false }),
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toMatch(/not verified/i);
  });

  // ── New user creation ──

  it('creates a new user + settings when no existing user found', async () => {
    mockSelectResult = []; // no existing user

    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: googleProfile(),
    });

    expect(result.allow).toBe(true);
    expect(result.userFields).toBeDefined();
    expect(result.userFields!.rememberMe).toBe(true);
    expect(result.userFields!.tokenVersion).toBe(0);
    expect(typeof result.userFields!.id).toBe('string');
    expect(result.userFields!.id).toHaveLength(36); // UUID v4

    // One user inserted
    expect(insertedUsers).toHaveLength(1);
    expect(insertedUsers[0]).toMatchObject({
      email: 'test@example.com',
      name: 'Test User',
    });

    // One settings row inserted
    expect(insertedSettings).toHaveLength(1);
    expect(insertedSettings[0]).toMatchObject({
      userId: result.userFields!.id,
      onboardingCompleted: false,
      defaultSymbol: 'XAUUSD',
    });

    // One account row inserted
    expect(insertedAccounts).toHaveLength(1);
    expect(insertedAccounts[0]).toMatchObject({
      provider: 'google',
      providerAccountId: 'google-123',
    });
  });

  // ── Existing user linking ──

  it('links existing user by email (no duplicate creation)', async () => {
    const existingUserId = 'existing-user-uuid';
    mockSelectResult = [{ id: existingUserId, tokenVersion: 3 }];

    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: googleProfile(),
    });

    expect(result.allow).toBe(true);
    expect(result.userFields!.id).toBe(existingUserId);
    expect(result.userFields!.tokenVersion).toBe(3);

    // No new user created
    expect(insertedUsers).toHaveLength(0);
    expect(insertedSettings).toHaveLength(0);

    // Account link row still inserted
    expect(insertedAccounts).toHaveLength(1);
  });

  // ── Email normalization ──

  it('lowercases and trims email before lookup', async () => {
    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: googleProfile({ email: '  Test@Example.COM  ' }),
    });

    expect(result.allow).toBe(true);
    // Verify email was normalized in the insert
    expect(insertedUsers[0]).toMatchObject({ email: 'test@example.com' });
  });

  // ── Fallback avatar ──

  it('generates DiceBear avatar when no picture provided', async () => {
    mockSelectResult = [];

    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: googleProfile({ picture: undefined }),
    });

    expect(result.allow).toBe(true);
    expect(insertedUsers[0]).toHaveProperty('image');
    const image = (insertedUsers[0] as Record<string, unknown>).image as string;
    expect(image).toContain('dicebear.com');
    expect(image).toContain('Test%20User');
  });

  // ── Fallback name ──

  it('uses email as name when profile.name is missing', async () => {
    mockSelectResult = [];

    const result = await provisionUserOnSignIn({
      user: {},
      account: googleAccount(),
      profile: googleProfile({ name: undefined }),
    });

    expect(result.allow).toBe(true);
    expect(insertedUsers[0]).toMatchObject({ name: 'test@example.com' });
  });
});
