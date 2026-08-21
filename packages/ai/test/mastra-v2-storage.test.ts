import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';

import {
  createMastraStorage,
  mastraDirectConnectionString,
  mastraSslOptions,
} from '../src/mastra-v2';

// NOTE: libsql `:memory:` databases are per-connection (the domain store and
// the store's own client would see different databases), so tests use a
// file-backed libsql URL.
function tempLibsqlUrl(): { url: string; cleanup: () => void } {
  const file = join(tmpdir(), `kestrel-mastra-storage-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  return { url: `file:${file}`, cleanup: () => rmSync(file, { force: true }) };
}

describe('mastra-v2 storage', () => {
  it('selects libsql by default when no database connection is configured', () => {
    const { url, cleanup } = tempLibsqlUrl();
    try {
      const { storage, kind } = createMastraStorage({ MASTRA_LIBSQL_URL: url });
      expect(kind).toBe('libsql');
      expect(storage).toBeInstanceOf(LibSQLStore);
    } finally {
      cleanup();
    }
  });

  it('selects postgres automatically when a connection string exists', () => {
    const { storage, kind } = createMastraStorage({
      DATABASE_URL: 'postgres://user:pass@db.example.com:5432/app',
    });
    expect(kind).toBe('postgres');
    expect(storage).toBeInstanceOf(PostgresStore);
  });

  it('honors an explicit MASTRA_STORAGE=postgres with the direct connection string', () => {
    const env = {
      MASTRA_STORAGE: 'postgres',
      DIRECT_URL: 'postgres://direct:pass@db.example.com:5432/app',
      POSTGRES_URL_NON_POOLING: 'postgres://np:pass@db.example.com:5432/app',
      DATABASE_URL: 'postgres://pooled:pass@db.example.com:6543/app',
    };
    const { storage, kind } = createMastraStorage(env);
    expect(kind).toBe('postgres');
    expect(storage).toBeInstanceOf(PostgresStore);
  });

  it('supports an explicit libsql url override', () => {
    const { url, cleanup } = tempLibsqlUrl();
    try {
      const { storage, kind } = createMastraStorage({
        MASTRA_STORAGE: 'libsql',
        MASTRA_LIBSQL_URL: url,
      });
      expect(kind).toBe('libsql');
      expect(storage).toBeInstanceOf(LibSQLStore);
    } finally {
      cleanup();
    }
  });

  it('throws when postgres is requested without any connection string', () => {
    expect(() => createMastraStorage({ MASTRA_STORAGE: 'postgres' })).toThrow(/DIRECT_URL/);
  });
});

describe('mastra-v2 storage connection helpers', () => {
  it('prefers DIRECT_URL over POSTGRES_URL_NON_POOLING over DATABASE_URL over POSTGRES_URL', () => {
    expect(
      mastraDirectConnectionString({
        DIRECT_URL: 'postgres://direct',
        POSTGRES_URL_NON_POOLING: 'postgres://np',
        DATABASE_URL: 'postgres://db',
        POSTGRES_URL: 'postgres://pg',
      }),
    ).toBe('postgres://direct');

    expect(mastraDirectConnectionString({ POSTGRES_URL_NON_POOLING: 'postgres://np' })).toBe(
      'postgres://np',
    );
    expect(mastraDirectConnectionString({ DATABASE_URL: 'postgres://db' })).toBe('postgres://db');
    expect(mastraDirectConnectionString({ POSTGRES_URL: 'postgres://pg' })).toBe('postgres://pg');
    expect(mastraDirectConnectionString({})).toBeNull();
  });

  it('verifies TLS in production and allows insecure only for the documented local boundary', () => {
    expect(mastraSslOptions({ NODE_ENV: 'production' })).toEqual({ rejectUnauthorized: true });
    // Local docker compose is the documented exception.
    expect(
      mastraSslOptions({
        NODE_ENV: 'production',
        DB_DISABLE_SSL: 'true',
        KESTREL_LOCAL_DOCKER: 'true',
      }),
    ).toBe(false);
    // Development defaults to unverified TLS (same policy as @kestrel/db).
    expect(mastraSslOptions({ NODE_ENV: 'development' })).toEqual({ rejectUnauthorized: false });
  });

  it('fails closed for DB_DISABLE_SSL in production without the local docker boundary', () => {
    expect(() => mastraSslOptions({ NODE_ENV: 'production', DB_DISABLE_SSL: 'true' })).toThrow(
      /DB_DISABLE_SSL/,
    );
    expect(() =>
      mastraSslOptions({
        NODE_ENV: 'production',
        DB_DISABLE_SSL: 'true',
        HAMAFX_LOCAL_DOCKER: 'true',
      }),
    ).not.toThrow();
  });

  it('uses the Supabase CA bundle when configured', () => {
    expect(mastraSslOptions({ NODE_ENV: 'production', SUPABASE_CA_CERT: 'CERT\\nLINE' })).toEqual({
      ca: 'CERT\nLINE',
      rejectUnauthorized: true,
    });
  });
});
