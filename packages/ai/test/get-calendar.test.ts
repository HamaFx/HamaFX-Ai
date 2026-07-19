/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCalendarTool } from '../src/tools/get-calendar';

const exec = getCalendarTool.execute as unknown as (
  input: { from?: number; to?: number; currencies?: string[]; minImportance?: string },
) => Promise<{
  items: Array<{
    id: string; title: string; country: string; currency: string;
    importance: string; date: number; actual: string | null;
    forecast: string | null; previous: string | null; unit: string | null;
    source: string | null;
  }>;
  pipelinePending: boolean;
}>;

// The tool calls getDb() twice:
// 1. Main query: .select().from().where().orderBy().limit()
// 2. Probe:       .select({id}).from().limit()
// So from() must expose both .where() AND .limit() directly.
const mockLimit = vi.fn();
const mockFromChain = {
  where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: mockLimit }) }),
  limit: mockLimit,
};
const mockFrom = vi.fn().mockReturnValue(mockFromChain);

vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({ from: mockFrom })),
  })),
  schema: {
    economicEvents: {},
  },
}));

describe('get_calendar — Phase 0.10', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(mockFromChain);
  });

  it('returns pipelinePending: true when table is empty', async () => {
    mockLimit.mockResolvedValueOnce([]);  // main query empty
    mockLimit.mockResolvedValueOnce([]);  // probe query empty

    const result = await exec({});

    expect(result.pipelinePending).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('validates input schema — accepts empty input (all defaults)', () => {
    const schema = getCalendarTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('validates input schema — minImportance accepts low/medium/high', () => {
    const schema = getCalendarTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ minImportance: 'low' }).success).toBe(true);
    expect(schema.safeParse({ minImportance: 'medium' }).success).toBe(true);
    expect(schema.safeParse({ minImportance: 'high' }).success).toBe(true);
    expect(schema.safeParse({ minImportance: 'critical' }).success).toBe(false);
  });

  it('validates input schema — minImportance defaults to medium', () => {
    const schema = getCalendarTool.inputSchema as { safeParse: (v: unknown) => { success: boolean; data?: { minImportance: string } } };
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.data) expect(parsed.data.minImportance).toBe('medium');
  });

  it('validates input schema — currencies accepts USD/EUR/GBP', () => {
    const schema = getCalendarTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ currencies: ['USD'] }).success).toBe(true);
    expect(schema.safeParse({ currencies: ['USD', 'EUR'] }).success).toBe(true);
    expect(schema.safeParse({ currencies: ['USD', 'EUR', 'GBP'] }).success).toBe(true);
    expect(schema.safeParse({ currencies: ['JPY'] }).success).toBe(false);
  });

  it('validates input schema — from/to must be integers', () => {
    const schema = getCalendarTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ from: 1_700_000_000_000 }).success).toBe(true);
    expect(schema.safeParse({ to: 1_800_000_000_000 }).success).toBe(true);
    expect(schema.safeParse({ from: 1.5 }).success).toBe(false);
  });

  it('executes successfully when from/to are omitted (defaults to now + 7 days)', async () => {
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);

    await exec({});
    // Verify the DB was queried — proves defaults produced valid Date objects
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledTimes(2);
  });

  it('executes successfully with explicit from/to timestamps', async () => {
    mockLimit.mockResolvedValueOnce([]);
    mockLimit.mockResolvedValueOnce([]);

    const now = Date.now();
    await exec({ from: now, to: now + 86400000 });

    expect(mockFrom).toHaveBeenCalled();
  });
});
