import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibSQLStore } from '@mastra/libsql';
import { LibSQLVector } from '@mastra/libsql';
import { PgVector } from '@mastra/pg';

import {
  createKestrelEmbedder,
  createKestrelMemory,
  createKestrelVectorStore,
  getKestrelVectorStore,
  kestrelMemoryOptions,
  _resetKestrelVectorStore,
} from '../src/mastra-v2';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  _resetKestrelVectorStore();
});

function tempLibsqlUrl(): string {
  const file = join(
    tmpdir(),
    `kestrel-mastra-memory-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  cleanups.push(() => rmSync(file, { force: true }));
  return `file:${file}`;
}

const NO_KEYS_SETTINGS = { aiApiKeys: null, embeddingModel: null };
const NO_KEYS_ENV = {};

describe('mastra-v2 vector store', () => {
  it('creates a LibSQLVector for the libsql kind', () => {
    const url = tempLibsqlUrl();
    const vector = createKestrelVectorStore('libsql', { MASTRA_LIBSQL_URL: url });
    expect(vector).toBeInstanceOf(LibSQLVector);
  });

  it('creates a PgVector for the postgres kind using the direct connection string', () => {
    const vector = createKestrelVectorStore('postgres', {
      DIRECT_URL: 'postgres://user:pass@db.example.com:5432/app',
    });
    expect(vector).toBeInstanceOf(PgVector);
  });

  it('throws for postgres without a connection string', () => {
    expect(() => createKestrelVectorStore('postgres', {})).toThrow(/DIRECT_URL/);
  });

  it('returns a cached singleton from getKestrelVectorStore', () => {
    const a = getKestrelVectorStore('libsql');
    const b = getKestrelVectorStore('libsql');
    expect(a).toBe(b);
  });
});

describe('mastra-v2 embedder', () => {
  it('wraps embedTexts as an AI SDK v2 embedding model with BYOK settings', async () => {
    const embedder = createKestrelEmbedder({
      settings: NO_KEYS_SETTINGS,
      env: NO_KEYS_ENV,
    });
    expect(embedder.specificationVersion).toBe('v2');
    expect(embedder.modelId).toMatch(/embedding/);
    expect(embedder.provider).toBe(embedder.modelId.split('/')[0]);
    expect(typeof embedder.doEmbed).toBe('function');
  });

  it('resolves the user embedding model over the operator default', () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-key-1234567890';
    try {
      const embedder = createKestrelEmbedder({
        // Stored picks use the canonical "<providerId>:<bareModelId>" format;
        // the operator's env default must lose to a valid user pick.
        settings: { aiApiKeys: null, embeddingModel: 'openai:text-embedding-3-small' },
        env: { AI_EMBEDDING_MODEL: 'google-vertex/text-embedding-004' },
      });
      expect(embedder.modelId).toBe('openai/text-embedding-3-small');
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });
});

describe('mastra-v2 memory options', () => {
  it('enables lastMessages, working memory, and semantic recall by default', () => {
    const options = kestrelMemoryOptions({ env: NO_KEYS_ENV });
    expect(options.lastMessages).toBe(20);
    expect(options.workingMemory).toMatchObject({ enabled: true, scope: 'resource' });
    expect(options.semanticRecall).toMatchObject({ topK: 4, scope: 'resource' });
    expect(options.observationalMemory).toBe(false);
  });

  it('disables semantic recall when ENABLE_MASTRA_SEMANTIC_RECALL=false', () => {
    const previous = process.env.ENABLE_MASTRA_SEMANTIC_RECALL;
    process.env.ENABLE_MASTRA_SEMANTIC_RECALL = 'false';
    try {
      const options = kestrelMemoryOptions({ env: NO_KEYS_ENV });
      expect(options.semanticRecall).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.ENABLE_MASTRA_SEMANTIC_RECALL;
      else process.env.ENABLE_MASTRA_SEMANTIC_RECALL = previous;
    }
  });

  it('enables observational memory only when explicitly gated', () => {
    const previous = process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
    process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY = 'true';
    try {
      const options = kestrelMemoryOptions({ env: NO_KEYS_ENV });
      expect(options.observationalMemory).toMatchObject({ scope: 'resource' });
    } finally {
      if (previous === undefined) delete process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY;
      else process.env.ENABLE_MASTRA_OBSERVATIONAL_MEMORY = previous;
    }
  });
});

describe('mastra-v2 memory instance', () => {
  it('builds a Memory over the provided storage and vector', async () => {
    const url = tempLibsqlUrl();
    const store = new LibSQLStore({ id: 'test-store', url });
    await store.init();
    cleanups.push(() => void store.close?.());
    const vector = new LibSQLVector({ id: 'test-vector', url });
    const memory = createKestrelMemory({
      storage: store,
      vector,
      settings: NO_KEYS_SETTINGS,
      env: NO_KEYS_ENV,
      options: { lastMessages: 5, workingMemory: { enabled: true, scope: 'resource' } },
    });
    expect(memory).toBeDefined();
    // Working memory round-trip through the composite store.
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    await memory.updateWorkingMemory({
      threadId: 't1',
      resourceId: 'u1',
      workingMemory: '# User Preferences\n- **Default symbol**: XAUUSD',
    });
    const stored = await memory.getWorkingMemory({ threadId: 't1', resourceId: 'u1' });
    expect(stored).toContain('XAUUSD');
  });

  it('scopes working memory strictly to the resource (no cross-user leakage)', async () => {
    const url = tempLibsqlUrl();
    const store = new LibSQLStore({ id: 'test-store', url });
    await store.init();
    cleanups.push(() => void store.close?.());
    const vector = new LibSQLVector({ id: 'test-vector', url });
    const memory = createKestrelMemory({
      storage: store,
      vector,
      settings: NO_KEYS_SETTINGS,
      env: NO_KEYS_ENV,
      options: { lastMessages: 5, workingMemory: { enabled: true, scope: 'resource' } },
    });
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    await memory.createThread({ threadId: 't2', resourceId: 'u2' });
    await memory.updateWorkingMemory({
      threadId: 't1',
      resourceId: 'u1',
      workingMemory: '# User Preferences\n- **Default symbol**: XAUUSD',
    });
    const otherUser = await memory.getWorkingMemory({ threadId: 't2', resourceId: 'u2' });
    expect(otherUser).toBeNull();
  });

  it('persists messages per thread and scopes them to the resource', async () => {
    const url = tempLibsqlUrl();
    const store = new LibSQLStore({ id: 'test-store', url });
    await store.init();
    cleanups.push(() => void store.close?.());
    const vector = new LibSQLVector({ id: 'test-vector', url });
    const memory = createKestrelMemory({
      storage: store,
      vector,
      settings: NO_KEYS_SETTINGS,
      env: NO_KEYS_ENV,
      options: { lastMessages: 5 },
    });
    await memory.createThread({ threadId: 't1', resourceId: 'u1' });
    await memory.saveMessages({
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: { format: 2, parts: [{ type: 'text', text: 'hello' }] },
          createdAt: new Date(),
          threadId: 't1',
          resourceId: 'u1',
        },
      ],
    });
    const listed = await memory.recall({ threadId: 't1', resourceId: 'u1', perPage: 10 });
    expect(listed.messages).toHaveLength(1);
    expect(listed.messages[0]?.content).toMatchObject({ format: 2 });
  });
});
