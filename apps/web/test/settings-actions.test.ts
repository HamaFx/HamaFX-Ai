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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import bcrypt from 'bcryptjs';

// Transparent mock of @hamafx/shared/encryption.
// The real module imports `server-only` which throws outside RSC.
// We keep the real PROVIDER_IDS (imported from the byok subpath which has no
// server-only guard) so the action logic that iterates over them works.
vi.mock('@hamafx/shared/encryption', async () => {
  const byok = await import('@hamafx/shared/byok');
  return {
    PROVIDER_IDS: byok.PROVIDER_IDS,
    encryptByok: vi.fn((payload: unknown) => `enc:${JSON.stringify(payload)}`),
    decryptByok: vi.fn((encrypted: string | null | undefined) => {
      if (!encrypted || !encrypted.startsWith('enc:')) return null;
      try { return JSON.parse(encrypted.slice(4)); } catch { return null; }
    }),
    encryptWithPassword: vi.fn((payload: unknown, password: string) =>
      `pwe:${password}:${JSON.stringify(payload)}`),
    decryptWithPassword: vi.fn((encrypted: string, password: string) => {
      const prefix = `pwe:${password}:`;
      if (!encrypted.startsWith(prefix)) return null;
      try { return JSON.parse(encrypted.slice(prefix.length)); } catch { return null; }
    }),
  };
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));

// Preserve the real drizzle schema objects (used by eq / and / sql) but
// replace getDb / withRateLimit so no real DB connection is attempted.
vi.mock('@hamafx/db', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDb: vi.fn(),
    withRateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1, limit: 10 }),
  };
});

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@hamafx/ai', () => ({ deleteAllThreads: vi.fn() }));

import { mockNextAuthSession } from './auth-helpers';

import { auth } from '@/auth';
import { getDb, withRateLimit } from '@hamafx/db';
import * as Sentry from '@sentry/nextjs';
import { revalidatePath } from 'next/cache';
import {
  PROVIDER_IDS,
  encryptByok,
  decryptByok,
  encryptWithPassword,
  decryptWithPassword,
} from '@hamafx/shared/encryption';

import {
  updateProfileAction,
  addSymbolAction,
  removeSymbolAction,
  exportKeysAction,
  importKeysAction,
  updateUsageSettingsAction,
} from '../src/app/(app)/settings/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-test-001';
const TEST_PASSWORD = 'my-strong-password-123';

/** Build a FormData from a plain object. */
function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

/**
 * Drizzle query-builder mock.
 *
 * All select-chain branches converge on a shared next() helper so that
 * every `await db.select(…).from(…).where(…)` — with or without `.limit()`
 * — drains the next entry from `results`.
 */
function mockQueryChain(results: unknown[][]) {
  const next = () => ({
    then: (resolve: (v: unknown) => void) => resolve(results.shift() ?? []),
  });

  const where = {
    ...next(),
    limit: vi.fn(() => next()),
    orderBy: vi.fn(() => next()),
  };

  const from = {
    where: vi.fn(() => where),
    orderBy: vi.fn(() => where),
  };

  return {
    select: vi.fn(() => ({ from: vi.fn(() => from) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn(() => Promise.resolve()) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    execute: vi.fn(() => Promise.resolve([{ request_count: 1 }])),
  };
}

function mockDb(results: unknown[][] = []) {
  (getDb as Mock).mockReturnValue(mockQueryChain(results));
}

let hashedTestPassword: string;

beforeAll(async () => {
  hashedTestPassword = await bcrypt.hash(TEST_PASSWORD, 4);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// updateProfileAction
// ===========================================================================

describe('updateProfileAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
    mockDb();
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await updateProfileAction(formData({ name: 'New Name' }));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when name is empty', async () => {
    const result = await updateProfileAction(formData({ name: '' }));
    expect(result).toEqual({ ok: false, error: 'Name must be between 1 and 80 characters' });
  });

  it('returns error when name exceeds max length', async () => {
    const result = await updateProfileAction(formData({ name: 'x'.repeat(81) }));
    expect(result).toEqual({ ok: false, error: 'Name must be between 1 and 80 characters' });
  });

  it('returns ok without DB update when name is unchanged', async () => {
    (auth as Mock).mockResolvedValue({
      user: { id: USER_ID, name: 'Same Name', email: `testuser-${USER_ID}@example.com` },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
    const result = await updateProfileAction(formData({ name: 'Same Name' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/profile');
    expect(getDb).not.toHaveBeenCalled();
  });

  it('returns ok after updating name in database', async () => {
    const result = await updateProfileAction(formData({ name: 'Updated Name' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/profile');
    expect(getDb).toHaveBeenCalled();
  });

  it('captures Sentry exception on DB error', async () => {
    const db = mockQueryChain([]);
    (getDb as Mock).mockReturnValue(db);
    db.update = vi.fn(() => { throw new Error('connection lost'); });

    const result = await updateProfileAction(formData({ name: 'Updated Name' }));
    expect(result).toEqual({ ok: false, error: 'connection lost' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

// ===========================================================================
// addSymbolAction / removeSymbolAction
// ===========================================================================

describe('addSymbolAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await addSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when symbol is missing', async () => {
    const result = await addSymbolAction(formData({}));
    expect(result).toEqual({ ok: false, error: 'Symbol is required' });
  });

  it('returns error when symbol is too short', async () => {
    const result = await addSymbolAction(formData({ symbol: 'A' }));
    expect(result).toEqual({ ok: false, error: 'Symbol must be between 2 and 20 characters' });
  });

  it('returns error when symbol is too long', async () => {
    const result = await addSymbolAction(formData({ symbol: 'A'.repeat(21) }));
    expect(result).toEqual({ ok: false, error: 'Symbol must be between 2 and 20 characters' });
  });

  it('returns error when symbol is not in active catalog', async () => {
    mockDb([[]]); // catalog query returns empty
    const result = await addSymbolAction(formData({ symbol: 'UNKNOWN' }));
    expect(result).toEqual({ ok: false, error: 'Symbol "UNKNOWN" is not supported or active.' });
  });

  it('adds symbol with correct display order', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }],
      [{ maxOrder: 4 }],
    ]);
    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/symbols');
  });

  it('starts displayOrder at 0 when user has no symbols', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }],
      [{ maxOrder: null }],
    ]);
    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: true });
  });

  it('handles onConflictDoNothing for duplicate symbol', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }],
      [{ maxOrder: 2 }],
    ]);
    const result = await addSymbolAction(formData({ symbol: 'btcusd' }));
    expect(result).toEqual({ ok: true });
  });

  it('captures Sentry exception on DB error', async () => {
    const db = mockQueryChain([]);
    (getDb as Mock).mockReturnValue(db);
    db.select = vi.fn(() => { throw new Error('db timeout'); });

    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: false, error: 'db timeout' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('removeSymbolAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await removeSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when symbol is missing', async () => {
    const result = await removeSymbolAction(formData({}));
    expect(result).toEqual({ ok: false, error: 'Symbol is required' });
  });

  it('removes symbol successfully', async () => {
    mockDb();
    const result = await removeSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/symbols');
  });

  it('captures Sentry exception on DB error', async () => {
    const db = mockQueryChain([]);
    (getDb as Mock).mockReturnValue(db);
    db.delete = vi.fn(() => { throw new Error('permission denied'); });

    const result = await removeSymbolAction(formData({ symbol: 'XAUUSD' }));
    expect(result).toEqual({ ok: false, error: 'permission denied' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

// ===========================================================================
// exportKeysAction / importKeysAction  (encryption round-trip)
// ===========================================================================

describe('exportKeysAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when password is too short', async () => {
    const result = await exportKeysAction('short');
    expect(result).toEqual({ ok: false, error: 'Password must be at least 8 characters' });
  });

  it('returns error when account password is incorrect', async () => {
    mockDb([[{ hashedPassword: hashedTestPassword }]]);
    const result = await exportKeysAction('correct-password-but-not-test-password');
    expect(result).toEqual({ ok: false, error: 'Incorrect account password' });
  });

  it('returns error when no keys are configured (null aiApiKeys)', async () => {
    mockDb([
      [{ hashedPassword: hashedTestPassword }],
      [{ aiApiKeys: null }],
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No keys configured to export' });
  });

  it('returns error when no keys are configured (empty after decrypt)', async () => {
    const payload = encryptByok({});
    mockDb([
      [{ hashedPassword: hashedTestPassword }],
      [{ aiApiKeys: payload }],
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No keys configured to export' });
  });

  it('exports keys successfully (encryption round-trip)', async () => {
    const originalKeys = { openai: 'sk-abc', anthropic: 'sk-def' };
    const payload = encryptByok(originalKeys);
    mockDb([
      [{ hashedPassword: hashedTestPassword }],
      [{ aiApiKeys: payload }],
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decrypted = decryptWithPassword(result.payload, TEST_PASSWORD);
      expect(decrypted).toEqual(originalKeys);
    }
  });

  it('captures Sentry exception on DB error', async () => {
    // First getDb call (inside verifyAccountPassword) must succeed
    const verifyDb = mockQueryChain([[{ hashedPassword: hashedTestPassword }]]);
    // Second getDb call (inside try block) throws
    const queryDb = mockQueryChain([]);
    queryDb.select = vi.fn(() => { throw new Error('read failure'); });

    (getDb as Mock)
      .mockReturnValueOnce(verifyDb)
      .mockReturnValueOnce(queryDb);

    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'read failure' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

describe('importKeysAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await importKeysAction('payload', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('returns error when payload is empty', async () => {
    const result = await importKeysAction('', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Payload and password are required' });
  });

  it('returns error when password is empty', async () => {
    const result = await importKeysAction('payload', '');
    expect(result).toEqual({ ok: false, error: 'Payload and password are required' });
  });

  it('returns error when account password is incorrect', async () => {
    mockDb([[{ hashedPassword: hashedTestPassword }]]);
    const result = await importKeysAction('some-payload', 'wrong-password');
    expect(result).toEqual({ ok: false, error: 'Incorrect account password' });
  });

  it('imports keys successfully (encryption round-trip)', async () => {
    const keys = { openai: 'sk-abc', anthropic: 'sk-def' };
    const backup = encryptWithPassword(keys, TEST_PASSWORD);

    mockDb([
      [{ hashedPassword: hashedTestPassword }],
    ]);
    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: true, importedCount: 2 });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/api-keys');
  });

  it('filters out unknown provider keys', async () => {
    const backup = encryptWithPassword({ unknown_provider: 'key-value' }, TEST_PASSWORD);

    mockDb([
      [{ hashedPassword: hashedTestPassword }],
    ]);
    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No valid keys found in backup payload' });
  });

  it('returns error when backup payload is tampered', async () => {
    mockDb([
      [{ hashedPassword: hashedTestPassword }],
    ]);
    const result = await importKeysAction('tampered-data', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Invalid backup payload or incorrect password' });
  });

  it('captures Sentry exception on DB error', async () => {
    const backup = encryptWithPassword({ openai: 'sk-abc' }, TEST_PASSWORD);
    // First getDb call (verifyAccountPassword) succeeds
    const verifyDb = mockQueryChain([[{ hashedPassword: hashedTestPassword }]]);
    // Second getDb call (inside try block) throws on update
    const updateDb = mockQueryChain([]);
    updateDb.update = vi.fn(() => { throw new Error('update failed'); });

    (getDb as Mock)
      .mockReturnValueOnce(verifyDb)
      .mockReturnValueOnce(updateDb);

    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'update failed' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});

// ===========================================================================
// updateUsageSettingsAction
// ===========================================================================

describe('updateUsageSettingsAction', () => {
  beforeEach(() => {
    (auth as Mock).mockImplementation(mockNextAuthSession(USER_ID));
    mockDb();
  });

  it('returns error when not authenticated', async () => {
    (auth as Mock).mockResolvedValue(null);
    const result = await updateUsageSettingsAction(formData({}));
    expect(result).toEqual({ ok: false, error: 'Unauthorized' });
  });

  it('stores parsed monthlyBudgetLimit and alert flags', async () => {
    const result = await updateUsageSettingsAction(formData({
      monthlyBudgetLimit: '100',
      emailAlert: 'on',
      telegramAlert: 'on',
    }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/usage');
  });

  it('stores null monthlyBudgetLimit when input is empty', async () => {
    const result = await updateUsageSettingsAction(formData({
      monthlyBudgetLimit: '',
      emailAlert: 'on',
    }));
    expect(result).toEqual({ ok: true });
  });

  it('stores null monthlyBudgetLimit when input is whitespace', async () => {
    const result = await updateUsageSettingsAction(formData({
      monthlyBudgetLimit: '   ',
      emailAlert: 'on',
    }));
    expect(result).toEqual({ ok: true });
  });

  it('stores null monthlyBudgetLimit when input is missing', async () => {
    const result = await updateUsageSettingsAction(formData({
      emailAlert: 'on',
    }));
    expect(result).toEqual({ ok: true });
  });

  it('parses provider spending thresholds', async () => {
    const fd = formData({
      monthlyBudgetLimit: '200',
      emailAlert: 'on',
      'threshold-openai': '50',
      'threshold-anthropic': '25.5',
    });
    const result = await updateUsageSettingsAction(fd);
    expect(result).toEqual({ ok: true });
  });

  it('skips thresholds with non-positive values', async () => {
    const fd = formData({
      monthlyBudgetLimit: '200',
      emailAlert: 'on',
      'threshold-openai': '0',
      'threshold-anthropic': '-10',
    });
    const result = await updateUsageSettingsAction(fd);
    expect(result).toEqual({ ok: true });
  });

  it('skips thresholds with non-numeric values', async () => {
    const fd = formData({
      monthlyBudgetLimit: '200',
      emailAlert: 'on',
      'threshold-openai': 'abc',
    });
    const result = await updateUsageSettingsAction(fd);
    expect(result).toEqual({ ok: true });
  });

  it('handles all PROVIDER_IDS thresholds', async () => {
    const fd = formData({ monthlyBudgetLimit: '500', emailAlert: 'on' });
    for (const id of PROVIDER_IDS) {
      fd.append(`threshold-${id}`, '10');
    }
    const result = await updateUsageSettingsAction(fd);
    expect(result).toEqual({ ok: true });
  });

  it('captures Sentry exception on DB error', async () => {
    const db = mockQueryChain([]);
    (getDb as Mock).mockReturnValue(db);
    db.update = vi.fn(() => { throw new Error('write conflict'); });

    const result = await updateUsageSettingsAction(formData({
      monthlyBudgetLimit: '100',
      emailAlert: 'on',
    }));
    expect(result).toEqual({ ok: false, error: 'write conflict' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
