/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from 'vitest';

// Regression guard for the production bug where withRateLimit() read `.rows`
// unconditionally. postgres-js (prod) returns a Result that *extends Array*
// (no `.rows`); PGlite (dev/tests) returns `{ rows }`. The limiter must read
// both shapes or the counter silently reads 0 in production and the limit
// never fires.
//
// withRateLimit imports getDb() (postgres-js) and needs a live database, so we
// lock the row-shape contract the production fix depends on directly. The
// extraction logic below MUST match packages/db/src/rate-limit.ts exactly.
function extractCount(rows: unknown): number {
  const list = (
    Array.isArray(rows) ? rows : ((rows as { rows?: Array<{ request_count: number }> }).rows ?? [])
  ) as Array<{ request_count: number }>;
  return Number(list[0]?.request_count ?? 0);
}

describe('rate-limit row-shape normalization', () => {
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

  it('coerces string/bigint counts to a number for comparison', () => {
    // postgres-js can return integer columns as string/bigint depending on
    // config; the comparison `count <= limit` must be numeric.
    expect(extractCount([{ request_count: '42' as unknown as number }])).toBe(42);
    expect(typeof extractCount([{ request_count: 42 }])).toBe('number');
  });
});
