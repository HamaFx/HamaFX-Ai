import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../src/client', () => ({
  getDb: vi.fn(() => 'postgres-client' as never),
  closeDb: vi.fn(),
}));

vi.mock('../src/pglite-client', () => ({
  getPGliteDb: vi.fn(() => Promise.resolve('pglite-client' as never)),
  applyMigrations: vi.fn(() => Promise.resolve()),
  closePGliteDb: vi.fn(),
}));

describe('local-db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe('getLocalDb', () => {
    it('connects to remote Postgres when DATABASE_URL is set', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://remote:5432/db');
      const { getLocalDb, getLocalDbMode } = await import('../src/local-db');

      const db = await getLocalDb();
      expect(db).toBe('postgres-client');
      expect(getLocalDbMode()).toBe('postgres');
    });

    it('connects to PGlite when no DATABASE_URL is set', async () => {
      vi.stubEnv('DATABASE_URL', '');
      vi.stubEnv('POSTGRES_URL', '');
      const { getLocalDb, getLocalDbMode } = await import('../src/local-db');

      const db = await getLocalDb();
      expect(db).toBe('pglite-client');
      expect(getLocalDbMode()).toBe('pglite');
    });

    it('uses POSTGRES_URL when DATABASE_URL is not set', async () => {
      vi.stubEnv('DATABASE_URL', '');
      vi.stubEnv('POSTGRES_URL', 'postgres://supabase:6543/db');
      const { getLocalDb } = await import('../src/local-db');

      const db = await getLocalDb();
      expect(db).toBe('postgres-client');
    });
  });

  describe('ensureMigrations', () => {
    it('does nothing when DATABASE_URL is set (remote Postgres)', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://remote:5432/db');
      const { ensureMigrations } = await import('../src/local-db');
      const { applyMigrations } = await import('../src/pglite-client');

      await ensureMigrations();
      expect(applyMigrations).not.toHaveBeenCalled();
    });

    it('applies PGlite migrations when no DATABASE_URL is set', async () => {
      vi.stubEnv('DATABASE_URL', '');
      vi.stubEnv('POSTGRES_URL', '');
      const { ensureMigrations } = await import('../src/local-db');
      const { applyMigrations } = await import('../src/pglite-client');

      await ensureMigrations();
      expect(applyMigrations).toHaveBeenCalled();
    });
  });

  describe('closeLocalDb', () => {
    it('closes PGlite when in pglite mode', async () => {
      vi.stubEnv('DATABASE_URL', '');
      vi.stubEnv('POSTGRES_URL', '');
      const { getLocalDb, closeLocalDb } = await import('../src/local-db');
      const { closePGliteDb } = await import('../src/pglite-client');

      await getLocalDb(); // sets mode to pglite
      await closeLocalDb();
      expect(closePGliteDb).toHaveBeenCalled();
    });

    it('closes Postgres when in postgres mode', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://remote:5432/db');
      const { getLocalDb, closeLocalDb } = await import('../src/local-db');
      const { closeDb } = await import('../src/client');

      await getLocalDb(); // sets mode to postgres
      await closeLocalDb();
      expect(closeDb).toHaveBeenCalled();
    });
  });

  describe('getLocalDbMode', () => {
    it('returns null before initialization', async () => {
      vi.stubEnv('DATABASE_URL', '');
      vi.stubEnv('POSTGRES_URL', '');
      const { getLocalDbMode } = await import('../src/local-db');
      expect(getLocalDbMode()).toBeNull();
    });
  });
});
