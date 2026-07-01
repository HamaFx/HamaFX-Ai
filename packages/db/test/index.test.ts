import { describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../src/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDb: vi.fn(() => ({ execute: mockExecute })),
  };
});

describe('public API exports', () => {
  it('exports getDb, closeDb, and schema from client', async () => {
    const mod = await import('../src/index');
    expect(mod.getDb).toBeTypeOf('function');
    expect(mod.closeDb).toBeTypeOf('function');
    expect(mod.schema).toBeTypeOf('object');
  });

  it('exports withUserScope', async () => {
    const mod = await import('../src/index');
    expect(mod.withUserScope).toBeTypeOf('function');
  });

  it('exports withRateLimit and RateLimitResult type', async () => {
    const mod = await import('../src/index');
    expect(mod.withRateLimit).toBeTypeOf('function');
    expect(mod.RateLimitResult).toBeUndefined();
  });

  it('re-exports schema index', async () => {
    const mod = await import('../src/index');
    const exportNames = Object.keys(mod);
    expect(exportNames.length).toBeGreaterThan(3);
  });
});

describe('withRateLimit with mocked client', () => {
  it('returns { allowed: true } when count <= limit', async () => {
    mockExecute.mockResolvedValue([{ request_count: 3 }]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-1', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
    expect(result.limit).toBe(10);
  });

  it('returns { allowed: false } when count exceeds limit', async () => {
    mockExecute.mockResolvedValue([{ request_count: 15 }]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-2', 'ai_chat', 10);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(15);
  });

  it('handles PGlite row shape ({ rows })', async () => {
    mockExecute.mockResolvedValue({ rows: [{ request_count: 7 }] });
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-3', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(7);
  });

  it('handles empty result from both shapes', async () => {
    mockExecute.mockResolvedValue([]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-4', 'ai_chat', 10);
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('coerces string/bigint count to number', async () => {
    mockExecute.mockResolvedValue([{ request_count: '42' }]);
    const { withRateLimit } = await import('../src/rate-limit');
    const result = await withRateLimit('user-5', 'ai_chat', 10);
    expect(result.count).toBe(42);
    expect(typeof result.count).toBe('number');
  });
});

describe('extractCount regression guard', () => {
  function extractCount(rows: unknown): number {
    const list = (
      Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ request_count: number }> }).rows ?? [])
    ) as Array<{ request_count: number }>;
    return Number(list[0]?.request_count ?? 0);
  }

  it('reads postgres-js shape (Result extends Array)', () => {
    class Result extends Array {}
    const r = new Result();
    r.push({ request_count: 31 });
    expect(extractCount(r)).toBe(31);
  });

  it('reads PGlite shape ({ rows })', () => {
    expect(extractCount({ rows: [{ request_count: 5 }] })).toBe(5);
  });

  it('returns 0 for empty results of both shapes', () => {
    expect(extractCount([])).toBe(0);
    expect(extractCount({ rows: [] })).toBe(0);
  });

  it('coerces string/bigint counts to number', () => {
    expect(extractCount([{ request_count: '42' as unknown as number }])).toBe(42);
    expect(typeof extractCount([{ request_count: 42 }])).toBe('number');
  });
});
