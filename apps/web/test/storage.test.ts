// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_IMAGE_BUCKET_NAME,
  CHAT_IMAGE_MAX_BYTES,
  safeGetItem,
  safeSetItem,
  uploadChatImage,
} from '../src/lib/storage';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k in store) delete store[k]; }),
    get length() { return Object.keys(store).length; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeGetItem', () => {
  it('returns the fallback when localStorage throws', () => {
    localStorage.getItem = vi.fn(() => { throw new Error('storage error'); });
    expect(safeGetItem('key', 'default')).toBe('default');
  });

  it('returns the fallback when item is null', () => {
    expect(safeGetItem('missing', 42)).toBe(42);
  });

  it('returns parsed JSON value when item exists', () => {
    localStorage.setItem('existing', '{"name":"test"}');
    expect(safeGetItem('existing', { name: '' })).toEqual({ name: 'test' });
  });

  it('returns parsed primitive values', () => {
    localStorage.setItem('count', '123');
    expect(safeGetItem('count', 0)).toBe(123);
  });

  it('returns fallback when JSON is malformed', () => {
    localStorage.setItem('bad', '{broken');
    expect(safeGetItem('bad', 'fallback')).toBe('fallback');
  });

  it('correctly parses boolean false', () => {
    localStorage.setItem('flag', 'false');
    expect(safeGetItem('flag', true)).toBe(false);
  });
});

describe('safeSetItem', () => {
  it('returns true on successful set', () => {
    expect(safeSetItem('key', { a: 1 })).toBe(true);
    expect(localStorage.getItem('key')).toBe('{"a":1}');
  });

  it('returns false when localStorage throws', () => {
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceededError'); });
    expect(safeSetItem('key', 'value')).toBe(false);
  });

  it('serializes objects to JSON', () => {
    safeSetItem('user', { id: 1, name: 'Alice' });
    expect(localStorage.getItem('user')).toBe('{"id":1,"name":"Alice"}');
  });

  it('serializes arrays to JSON', () => {
    safeSetItem('list', [1, 2, 3]);
    expect(localStorage.getItem('list')).toBe('[1,2,3]');
  });
});

describe('storage constants', () => {
  it('exports the correct bucket name', () => {
    expect(CHAT_IMAGE_BUCKET_NAME).toBe('chat-images');
  });

  it('exports the correct max upload size', () => {
    expect(CHAT_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('uploadChatImage — validation', () => {
  const env = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  };

  const validInput = {
    userId: 'user-123',
    body: new Uint8Array([1, 2, 3]),
    mediaType: 'image/png',
    filename: 'screenshot.png',
  };

  it('throws when body is empty', async () => {
    await expect(
      uploadChatImage(env, { ...validInput, body: new Uint8Array(0) }),
    ).rejects.toThrow('upload payload is empty');
  });

  it('throws when body exceeds max upload size', async () => {
    const tooBig = new Uint8Array(6 * 1024 * 1024);
    await expect(
      uploadChatImage(env, { ...validInput, body: tooBig }),
    ).rejects.toThrow('upload exceeds');
  });

  it('throws when media type is not an image', async () => {
    await expect(
      uploadChatImage(env, { ...validInput, mediaType: 'text/plain' }),
    ).rejects.toThrow('media type text/plain is not an image');
  });

  it('accepts various image media types', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const types = ['image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
    for (const mediaType of types) {
      await expect(
        uploadChatImage(env, { ...validInput, mediaType }),
      ).resolves.toBeDefined();
    }
    vi.restoreAllMocks();
  });

  it('throws when Supabase returns non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );
    await expect(uploadChatImage(env, validInput)).rejects.toThrow('Supabase Storage upload failed: HTTP 401');
    vi.restoreAllMocks();
  });

  it('returns the correct result shape on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const result = await uploadChatImage(env, validInput);
    expect(result).toMatchObject({
      url: expect.stringContaining('/storage/v1/object/public/chat-images/'),
      path: expect.stringContaining('user-123/'),
      mediaType: 'image/png',
      uploadedAt: expect.any(Number),
    });
    vi.restoreAllMocks();
  });
});
