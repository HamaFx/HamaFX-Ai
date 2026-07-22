// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import bcrypt from 'bcryptjs';

// Transparent mock of @hamafx/shared/encryption.
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

const mockGetDb = vi.hoisted(() => vi.fn());
const mockWithRateLimit = vi.hoisted(() => vi.fn());
const mockUpdateUserDisplayName = vi.hoisted(() => vi.fn());
const mockGetUserPasswordHash = vi.hoisted(() => vi.fn());
// Self-referencing proxy: schema.anything.anything... always returns a truthy
// object so drizzle column accesses (e.g. schema.symbolCatalog.symbol) don't throw.
const schemaProxy = vi.hoisted(() => {
  const p: Record<string, unknown> = {};
  return new Proxy(p, {
    get: (_target, prop) => {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      return schemaProxy;
    },
  });
});

vi.mock('@hamafx/db', () => ({
  getDb: mockGetDb,
  withRateLimit: mockWithRateLimit,
  updateUserDisplayName: mockUpdateUserDisplayName,
  getUserPasswordHash: mockGetUserPasswordHash,
  schema: schemaProxy,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@hamafx/ai', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getDb: mockGetDb,
    deleteAllThreads: vi.fn(),
  };
});

// Pre-register mock DB in the container BEFORE @hamafx/ai is imported.
// importOriginal for @hamafx/ai runs db.ts which does container.register('db', ...),
// but since @hamafx/db is mocked and getRawDb = mockGetDb, the container will
// resolve to mockGetDb correctly.
import { container } from '@hamafx/shared';
container.register('db', () => mockGetDb());

import { mockNextAuthSession } from './auth-helpers';

import { auth } from '@/auth';
import { getDb, updateUserDisplayName, getUserPasswordHash } from '@hamafx/db';
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

const USER_ID = 'user-test-001';
const TEST_PASSWORD = 'my-strong-password-123';

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

/**
 * Drizzle query-builder mock.
 * Each call to a chain method returns a new thenable that resolves to the
 * next entry in `results`. Use for sequential db.select / db.insert / etc.
 */
function mockQueryChain(results: unknown[][] = []) {
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
    transaction: vi.fn((cb: (tx: unknown) => Promise<void>) => {
      const tx = mockQueryChain(results);
      return cb(tx);
    }),
  };
}

function mockDb(results: unknown[][] = []) {
  mockGetDb.mockReturnValue(mockQueryChain(results));
}

let hashedTestPassword: string;

beforeAll(async () => {
  hashedTestPassword = await bcrypt.hash(TEST_PASSWORD, 4);
});

beforeEach(() => {
  mockWithRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 10 });
  // verifyAccountPassword calls getUserPasswordHash internally, so the mock
  // must return the known hash so bcrypt.compare can succeed.
  mockGetUserPasswordHash.mockResolvedValue(hashedTestPassword);
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
    expect(updateUserDisplayName).not.toHaveBeenCalled();
  });

  it('returns ok after updating name in database', async () => {
    const result = await updateProfileAction(formData({ name: 'Updated Name' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/profile');
    expect(updateUserDisplayName).toHaveBeenCalledWith(USER_ID, 'Updated Name');
  });

  it('captures Sentry exception on DB error', async () => {
    (updateUserDisplayName as Mock).mockRejectedValueOnce(new Error('connection lost'));

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
    mockDb([[]]);
    const result = await addSymbolAction(formData({ symbol: 'UNKNOWN' }));
    expect(result).toEqual({ ok: false, error: 'Symbol "UNKNOWN" is not supported or active.' });
  });

  it('adds symbol with correct display order', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }],    // catalog select
      [{ maxOrder: 4 }],          // maxOrder select
    ]);
    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/symbols');
  });

  it('starts displayOrder at 0 when user has no symbols', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }],    // catalog select
      [{ maxOrder: null }],       // maxOrder select
    ]);
    const result = await addSymbolAction(formData({ symbol: 'BTCUSD' }));
    expect(result).toEqual({ ok: true });
  });

  it('handles onConflictDoNothing for duplicate symbol', async () => {
    mockDb([
      [{ symbol: 'BTCUSD' }],    // catalog select
      [{ maxOrder: 2 }],          // maxOrder select
    ]);
    const result = await addSymbolAction(formData({ symbol: 'btcusd' }));
    expect(result).toEqual({ ok: true });
  });

  it('captures Sentry exception on DB error', async () => {
    const db = mockQueryChain([]);
    mockGetDb.mockReturnValue(db);
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
    mockGetDb.mockReturnValue(db);
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
    // verifyAccountPassword calls getUserPasswordHash(userId) which returns
    // hashedTestPassword. bcrypt.compare will fail for a different password.
    // The 2FA check calls getDb() BEFORE password verification, so we need a mock.
    mockDb([[{ twoFactorEnabled: false }]]);
    const result = await exportKeysAction('wrong-password-123');
    expect(result).toEqual({ ok: false, error: 'Incorrect account password' });
  });

  it('returns error when no keys are configured (null aiApiKeys)', async () => {
    // exportKeysAction calls getDb() twice: once for 2FA check, once for keys.
    // The first getDb call selects twoFactorEnabled, the second selects aiApiKeys.
    mockDb([
      [{ twoFactorEnabled: false }],   // 2FA check
      [{ aiApiKeys: null }],           // key retrieval
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No keys configured to export' });
  });

  it('returns error when no keys are configured (empty after decrypt)', async () => {
    const payload = encryptByok({});
    mockDb([
      [{ twoFactorEnabled: false }],   // 2FA check
      [{ aiApiKeys: payload }],        // key retrieval
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No keys configured to export' });
  });

  it('exports keys successfully (encryption round-trip)', async () => {
    const originalKeys = { openai: 'sk-abc', anthropic: 'sk-def' };
    const payload = encryptByok(originalKeys);
    mockDb([
      [{ twoFactorEnabled: false }],   // 2FA check
      [{ aiApiKeys: payload }],        // key retrieval
    ]);
    const result = await exportKeysAction(TEST_PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decrypted = decryptWithPassword(result.data!.payload, TEST_PASSWORD);
      expect(decrypted).toEqual(originalKeys);
    }
  });

  it('captures Sentry exception on DB error', async () => {
    // First getDb call: returns twoFactorEnabled fine.
    // Second getDb call: throws on select.
    const okDb = mockQueryChain([[{ twoFactorEnabled: false }]]);
    const badDb = mockQueryChain([]);
    badDb.select = vi.fn(() => { throw new Error('read failure'); });

    mockGetDb
      .mockReturnValueOnce(okDb)
      .mockReturnValueOnce(badDb);

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
    (getUserPasswordHash as Mock).mockResolvedValueOnce('wrong-hash');

    const result = await importKeysAction('backup-string', 'wrong-pass');
    expect(result).toEqual({ ok: false, error: 'Incorrect account password' });
  });

  it('imports keys successfully (encryption round-trip)', async () => {
    const backup = encryptWithPassword({ anthropic: 'sk-new1', google: 'AIza-new2' }, TEST_PASSWORD);
    // verifyAccountPassword calls getUserPasswordHash → returns hashedTestPassword (set in beforeEach)
    // importKeysAction then calls getDb() once for the update
    mockDb();
    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: true, data: { importedCount: 2 } });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/api-keys');
  });

  it('filters out unknown provider keys', async () => {
    const backup = encryptWithPassword({ unknown_provider: 'key-value' }, TEST_PASSWORD);
    const result = await importKeysAction(backup, TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'No valid keys found in backup payload' });
  });

  it('returns error when backup payload is tampered', async () => {
    const result = await importKeysAction('tampered-data', TEST_PASSWORD);
    expect(result).toEqual({ ok: false, error: 'Invalid backup payload or incorrect password' });
  });

  it('captures Sentry exception on DB error', async () => {
    const backup = encryptWithPassword({ openai: 'sk-abc' }, TEST_PASSWORD);

    // importKeysAction calls getDb() once for the update
    const badDb = mockQueryChain([]);
    badDb.update = vi.fn(() => { throw new Error('update failed'); });
    mockGetDb.mockReturnValueOnce(badDb);

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

  it('captures Sentry exception on DB error', async () => {
    const db = mockQueryChain([]);
    mockGetDb.mockReturnValue(db);
    db.update = vi.fn(() => { throw new Error('write conflict'); });

    const result = await updateUsageSettingsAction(formData({
      monthlyBudgetLimit: '100',
      emailAlert: 'on',
    }));
    expect(result).toEqual({ ok: false, error: 'write conflict' });
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
