// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The SUT reads `.hamafx/dev-secrets.json` via process.cwd(). We need to
// redirect it to a per-test temp directory. We do that by setting
// HOME (used by some paths) and chdir to a temp dir before each test.
let workdir = '';

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'hamafx-dev-secrets-'));
  vi.spyOn(process, 'cwd').mockReturnValue(workdir);
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  for (const k of [
    'NEXTAUTH_SECRET',
    'ENCRYPTION_SECRET',
    'CRON_SECRET',
    'NODE_ENV',
  ]) delete process.env[k];
  vi.restoreAllMocks();
});

// Import lazily so the module-scoped state is captured after our mocks.
async function freshImport() {
  vi.resetModules();
  return import('@/lib/env');
}

describe('loadOrGenerateDevSecrets', () => {
  it('returns no-op in production', async () => {
    process.env.NODE_ENV = 'production';
    const { loadOrGenerateDevSecrets } = await freshImport();
    const result = loadOrGenerateDevSecrets();
    expect(result.generated).toBe(false);
    expect(result.store).toEqual({});
    expect(process.env.NEXTAUTH_SECRET).toBeUndefined();
  });

  it('generates fresh secrets on first call in dev', async () => {
    process.env.NODE_ENV = 'development';
    const { loadOrGenerateDevSecrets } = await freshImport();
    const result = loadOrGenerateDevSecrets();
    expect(result.generated).toBe(true);
    expect(process.env.NEXTAUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(process.env.ENCRYPTION_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(process.env.CRON_SECRET).toMatch(/^[0-9a-f]{32}$/);
    // Persisted to disk.
    const path = join(workdir, '.hamafx/dev-secrets.json');
    expect(existsSync(path)).toBe(true);
    const stored = JSON.parse(readFileSync(path, 'utf8'));
    expect(stored.NEXTAUTH_SECRET).toBe(process.env.NEXTAUTH_SECRET);
  });

  it('reuses persisted secrets on subsequent calls', async () => {
    process.env.NODE_ENV = 'development';
    const mod1 = await freshImport();
    mod1.loadOrGenerateDevSecrets();
    const first = {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
      ENCRYPTION_SECRET: process.env.ENCRYPTION_SECRET!,
      CRON_SECRET: process.env.CRON_SECRET!,
    };
    // Drop the in-memory values, force the next import to reload from disk.
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    delete process.env.CRON_SECRET;

    const mod2 = await freshImport();
    const result = mod2.loadOrGenerateDevSecrets();
    expect(result.generated).toBe(false);
    expect(process.env.NEXTAUTH_SECRET).toBe(first.NEXTAUTH_SECRET);
    expect(process.env.ENCRYPTION_SECRET).toBe(first.ENCRYPTION_SECRET);
    expect(process.env.CRON_SECRET).toBe(first.CRON_SECRET);
  });

  it('does not overwrite values already on process.env', async () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXTAUTH_SECRET = 'a'.repeat(64);
    process.env.ENCRYPTION_SECRET = 'b'.repeat(64);
    process.env.CRON_SECRET = 'c'.repeat(32);

    const { loadOrGenerateDevSecrets } = await freshImport();
    const result = loadOrGenerateDevSecrets();
    expect(result.generated).toBe(false);
    expect(process.env.NEXTAUTH_SECRET).toBe('a'.repeat(64));
    expect(process.env.ENCRYPTION_SECRET).toBe('b'.repeat(64));
    expect(process.env.CRON_SECRET).toBe('c'.repeat(32));
  });

  it('recovers from a corrupted dev-secrets file', async () => {
    process.env.NODE_ENV = 'development';
    // Write a garbage file to the expected path.
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const path = join(workdir, '.hamafx/dev-secrets.json');
    mkdirSync(join(workdir, '.hamafx'), { recursive: true });
    writeFileSync(path, '{ not valid json');

    const { loadOrGenerateDevSecrets } = await freshImport();
    const result = loadOrGenerateDevSecrets();
    expect(result.generated).toBe(true);
    expect(process.env.NEXTAUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('getServerEnv — uses generated secrets', () => {
  it('parses successfully in dev with no secrets on process.env', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://user:***@localhost:5432/db';
    process.env.AI_GATEWAY_API_KEY = 'test-gateway';
    const { getServerEnv } = await freshImport();
    const env = getServerEnv();
    expect(env.NODE_ENV).toBe('development');
    // Generated on first call.
    expect(env.NEXTAUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(env.ENCRYPTION_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(env.CRON_SECRET).toMatch(/^[0-9a-f]{32}$/);
  });
});