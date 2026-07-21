import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { listStorageObjects, deleteStorageObjects } from '../src/adapters/storage';
import type { SupabaseStorageEnv } from '../src/adapters/storage';

const TEST_ENV: SupabaseStorageEnv = {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key-123',
};

describe('listStorageObjects', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns list of objects for a successful response', async () => {
    const mockResponse = new Response(
      JSON.stringify([{ name: 'file1.png' }, { name: 'file2.png' }]),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await listStorageObjects(TEST_ENV, 'screenshots', 'public/');

    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('file1.png');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://test-project.supabase.co/storage/v1/object/list/screenshots',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-key-123',
        }),
      }),
    );
  });

  it('returns empty array when response is not an array', async () => {
    const mockResponse = new Response(JSON.stringify({ error: 'not found' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await listStorageObjects(TEST_ENV, 'bucket', '');
    expect(result).toEqual([]);
  });

  it('throws on non-ok response', async () => {
    const mockResponse = new Response('Forbidden', {
      status: 403,
      statusText: 'Forbidden',
    });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await expect(
      listStorageObjects(TEST_ENV, 'bucket', ''),
    ).rejects.toThrow(/Supabase Storage list failed: HTTP 403/);
  });
});

describe('deleteStorageObjects', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('succeeds with a 200 response', async () => {
    const mockResponse = new Response(null, { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await expect(
      deleteStorageObjects(TEST_ENV, 'screenshots', ['file1.png', 'file2.png']),
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      'https://test-project.supabase.co/storage/v1/object/screenshots',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ prefixes: ['file1.png', 'file2.png'] }),
      }),
    );
  });

  it('throws on non-ok response', async () => {
    const mockResponse = new Response('Not Found', { status: 404 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await expect(
      deleteStorageObjects(TEST_ENV, 'bucket', ['missing.txt']),
    ).rejects.toThrow(/Supabase Storage delete failed: HTTP 404/);
  });
});
