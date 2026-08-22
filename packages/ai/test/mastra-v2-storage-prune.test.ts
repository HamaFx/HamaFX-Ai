// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the PostgresStore and LibSQLStore so we can control whether
// `prune()` exists on the returned storage object. The pruneMastraStorage
// function calls createMastraStorage(process.env) which picks PostgresStore
// or LibSQLStore based on env — we control which constructor is used via
// MASTRA_STORAGE env var.

const mockPostgresPrune = vi.fn();
const MockPostgresStore = vi.fn().mockImplementation(() => ({
  prune: mockPostgresPrune,
}));

vi.mock('@mastra/pg', () => ({
  PostgresStore: MockPostgresStore,
  PgVector: vi.fn(),
}));

vi.mock('@mastra/libsql', () => ({
  LibSQLStore: vi.fn().mockImplementation(() => ({
    // LibSQL store does not expose prune() — tests the "not available" path.
  })),
  LibSQLVector: vi.fn(),
}));

// Import after mocks are registered.
const { pruneMastraStorage } = await import('../src/mastra-v2/storage');

describe('pruneMastraStorage', () => {
  afterEach(() => {
    mockPostgresPrune.mockReset();
    MockPostgresStore.mockClear();
  });

  it('calls store.prune() when available and returns pruned: true', async () => {
    // Force postgres storage (which has prune in our mock).
    const original = process.env.MASTRA_STORAGE;
    process.env.MASTRA_STORAGE = 'postgres';
    process.env.DIRECT_URL = 'postgres://localhost/test';
    try {
      mockPostgresPrune.mockResolvedValue(undefined);
      const result = await pruneMastraStorage();
      expect(mockPostgresPrune).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ pruned: true });
    } finally {
      process.env.MASTRA_STORAGE = original;
      delete process.env.DIRECT_URL;
    }
  });

  it('returns pruned: false when prune() is not available (LibSQL)', async () => {
    // Force libsql storage (no prune in our mock).
    const original = process.env.MASTRA_STORAGE;
    process.env.MASTRA_STORAGE = 'libsql';
    try {
      const result = await pruneMastraStorage();
      expect(result.pruned).toBe(false);
      expect(result.error).toBe('storage.prune() not available');
    } finally {
      process.env.MASTRA_STORAGE = original;
    }
  });

  it('returns pruned: false with error when prune() throws', async () => {
    const original = process.env.MASTRA_STORAGE;
    process.env.MASTRA_STORAGE = 'postgres';
    process.env.DIRECT_URL = 'postgres://localhost/test';
    try {
      mockPostgresPrune.mockRejectedValue(new Error('connection lost'));
      const result = await pruneMastraStorage();
      expect(result.pruned).toBe(false);
      expect(result.error).toBe('connection lost');
    } finally {
      process.env.MASTRA_STORAGE = original;
      delete process.env.DIRECT_URL;
    }
  });
});
