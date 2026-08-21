import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LibSQLStore } from '@mastra/libsql';
import { LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

// Real module mock: replaces only `listMessages` with a spy so the backfill
// tests can stub Drizzle history without touching the DB. The rest of the
// persistence barrel stays intact.
vi.mock('../src/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/persistence')>();
  return { ...actual, listMessages: vi.fn() };
});

import {
  backfillThreadHistoryIfNeeded,
  memoryCallOptions,
  prepareKestrelMemory,
  seedWorkingMemoryFromSettings,
} from '../src/mastra-v2';
import { listMessages } from '../src/persistence';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

function tempLibsqlUrl(): string {
  const file = join(
    tmpdir(),
    `kestrel-mastra-context-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  cleanups.push(() => rmSync(file, { force: true }));
  return `file:${file}`;
}

async function buildMemory(): Promise<Memory> {
  const url = tempLibsqlUrl();
  const store = new LibSQLStore({ id: 'test-store', url });
  await store.init();
  cleanups.push(() => void store.close?.());
  const vector = new LibSQLVector({ id: 'test-vector', url });
  return new Memory({
    storage: store,
    vector,
    options: {
      lastMessages: 5,
      workingMemory: { enabled: true, scope: 'resource' },
    },
  });
}

describe('mastra-v2 memory call options', () => {
  it('maps thread and resource (userId) into the per-call memory option', () => {
    expect(memoryCallOptions({ userId: 'u1', threadId: 't1' })).toEqual({
      thread: { id: 't1' },
      resource: 'u1',
    });
  });

  it('includes an optional thread title', () => {
    expect(memoryCallOptions({ userId: 'u1', threadId: 't1', title: 'Gold' })).toEqual({
      thread: { id: 't1', title: 'Gold' },
      resource: 'u1',
    });
  });
});

describe('mastra-v2 working memory seed', () => {
  it('seeds working memory from Drizzle settings once, then no-ops', async () => {
    const memory = await buildMemory();
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    const settings = {
      defaultSymbol: 'XAUUSD',
      language: 'en',
      timezone: 'Asia/Riyadh',
      chatModel: 'openai/gpt-4.1-mini',
      defaultModels: null,
      embeddingModel: null,
    };
    const first = await seedWorkingMemoryFromSettings({
      memory,
      userId: 'u1',
      threadId: 't1',
      settings,
    });
    expect(first).toBe(true);
    const stored = await memory.getWorkingMemory({ threadId: 't1', resourceId: 'u1' });
    expect(stored).toContain('XAUUSD');
    expect(stored).toContain('Asia/Riyadh');
    expect(stored).toContain('openai/gpt-4.1-mini');

    const second = await seedWorkingMemoryFromSettings({
      memory,
      userId: 'u1',
      threadId: 't1',
      settings,
    });
    expect(second).toBe(false);
  });

  it('never seeds another user working memory', async () => {
    const memory = await buildMemory();
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    await memory.createThread({ threadId: 't2', resourceId: 'u2' });
    await seedWorkingMemoryFromSettings({
      memory,
      userId: 'u1',
      threadId: 't1',
      settings: { defaultSymbol: 'XAUUSD', language: 'en', timezone: 'UTC' },
    });
    const other = await memory.getWorkingMemory({ threadId: 't2', resourceId: 'u2' });
    expect(other).toBeNull();
  });

  it('degrades gracefully when the memory write fails', async () => {
    const memory = await buildMemory();
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    vi.spyOn(memory, 'getWorkingMemory').mockRejectedValueOnce(new Error('storage down'));
    const result = await seedWorkingMemoryFromSettings({
      memory,
      userId: 'u1',
      threadId: 't1',
      settings: { defaultSymbol: 'XAUUSD' },
    });
    expect(result).toBe(false);
  });
});

describe('mastra-v2 thread backfill', () => {
  it('returns 0 when the thread already has messages in Mastra storage', async () => {
    const memory = await buildMemory();
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    await memory.saveMessages({
      messages: [
        {
          id: 'existing',
          role: 'user',
          content: { format: 2, parts: [{ type: 'text', text: 'hi' }] },
          createdAt: new Date(),
          threadId: 't1',
          resourceId: 'u1',
        },
      ],
    });
    const backfilled = await backfillThreadHistoryIfNeeded({
      memory,
      userId: 'u1',
      threadId: 't1',
    });
    expect(backfilled).toBe(0);
  });

  it('creates the thread and copies Drizzle history into Mastra storage', async () => {
    const memory = await buildMemory();
    const rows = [
      { id: 'd1', threadId: 't1', role: 'user', content: 'first', parts: null, createdAt: Date.now() },
      {
        id: 'd2',
        threadId: 't1',
        role: 'assistant',
        content: 'second',
        parts: null,
        createdAt: Date.now() + 1,
      },
    ];
    vi.mocked(listMessages).mockResolvedValue(rows as never);

    const backfilled = await backfillThreadHistoryIfNeeded({
      memory,
      userId: 'u1',
      threadId: 't1',
    });
    expect(backfilled).toBe(2);
    const listed = await memory.recall({ threadId: 't1', resourceId: 'u1', perPage: 10 });
    expect(listed.messages).toHaveLength(2);
    expect(listed.messages.map((m) => m.content)).toEqual([
      expect.objectContaining({ format: 2 }),
      expect.objectContaining({ format: 2 }),
    ]);
  });

  it('returns 0 when Drizzle has no history', async () => {
    const memory = await buildMemory();
    vi.mocked(listMessages).mockResolvedValue([]);
    const backfilled = await backfillThreadHistoryIfNeeded({
      memory,
      userId: 'u1',
      threadId: 't1',
    });
    expect(backfilled).toBe(0);
  });
});

describe('mastra-v2 prepareKestrelMemory', () => {
  it('combines call options, seed, and backfill in one call', async () => {
    const memory = await buildMemory();
    vi.mocked(listMessages).mockResolvedValue([]);

    const prepared = await prepareKestrelMemory({
      memory,
      userId: 'u1',
      threadId: 't1',
      settings: { defaultSymbol: 'XAUUSD', language: 'en', timezone: 'UTC' },
      backfill: true,
    });
    expect(prepared.callOptions).toEqual({ thread: { id: 't1' }, resource: 'u1' });
    expect(prepared.seededWorkingMemory).toBe(true);
    expect(prepared.backfilledMessages).toBe(0);
  });
});
