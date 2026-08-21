import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LibSQLStore } from '@mastra/libsql';

import {
  createKestrelMastra,
  _resetKestrelMastra,
  getKestrelMastra,
  initializeKestrelMastra,
  MASTRA_DEFAULT_HOST,
  MASTRA_DEFAULT_PORT,
} from '../src/mastra-v2';

// NOTE: libsql `:memory:` databases are per-connection — the domain store and
// the store's own client would see different databases. Tests must use a
// file-backed libsql URL.
function memoryStore(): LibSQLStore {
  const file = join(tmpdir(), `kestrel-mastra-instance-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  afterEach(() => {
    rmSync(file, { force: true });
  });
  return new LibSQLStore({ id: 'test-store', url: `file:${file}` });
}

describe('mastra-v2 instance', () => {
  afterEach(() => {
    _resetKestrelMastra();
  });

  it('builds a Mastra instance with storage and a server config', async () => {
    const storage = memoryStore();
    const { instance, storageKind } = createKestrelMastra({
      storage,
      storageKind: 'libsql',
      env: { NODE_ENV: 'test', MASTRA_SERVER_PORT: '4321', MASTRA_SERVER_HOST: '127.0.0.1' },
    });
    expect(storageKind).toBe('libsql');
    // Core 1.60 wraps the provided store in a MastraCompositeStore; verify
    // the passed store is actually wired up by round-tripping a thread
    // through the instance's memory domain (after boot-time schema init).
    await initializeKestrelMastra({ instance, storageKind });
    const composite = instance.getStorage();
    const memory = await composite?.getStore('memory');
    expect(memory).toBeTruthy();
    await memory?.saveThread({
      thread: {
        id: 't1',
        resourceId: 'u1',
        title: 'hello',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      },
    });
    const result = await memory?.listThreads({ filter: { resourceId: 'u1' }, perPage: false });
    expect(result?.threads.map((t) => t.id)).toContain('t1');
    expect(instance.getServer()).toMatchObject({ port: 4321, host: '127.0.0.1' });
  });

  it('defaults the server port/host', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(instance.getServer()).toMatchObject({
      port: MASTRA_DEFAULT_PORT,
      host: MASTRA_DEFAULT_HOST,
    });
  });

  it('keeps Mastra internal workers disabled for the web process', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(instance.getWorker('default-scheduler')).toBeUndefined();
  });

  it('returns a stable process-wide singleton', () => {
    expect(getKestrelMastra()).toBe(getKestrelMastra());
  });

  it('rebuilds the singleton after a reset', () => {
    const first = getKestrelMastra();
    _resetKestrelMastra();
    const second = getKestrelMastra();
    expect(second).not.toBe(first);
  });

  it('initializes storage schema idempotently', async () => {
    const storage = memoryStore();
    const mastra = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    const initSpy = vi.spyOn(storage, 'init');
    await initializeKestrelMastra(mastra);
    expect(initSpy).toHaveBeenCalledOnce();
  });

  it('wires the Mastra logger adapter (default) without throwing', () => {
    const storage = memoryStore();
    const { instance } = createKestrelMastra({ storage, storageKind: 'libsql', env: {} });
    expect(instance.getLogger()).toBeTruthy();
  });
});
