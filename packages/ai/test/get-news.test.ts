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

import { getNewsTool } from '../src/tools/get-news';

const exec = getNewsTool.execute as unknown as (
  input: { symbol?: string; since?: number; limit?: number; minSentiment?: number },
) => Promise<{
  items: Array<{
    id: string; title: string; summary: string | null; url: string;
    source: string; publisher: string | null; publishedAt: number;
    sentiment: string | null; sentimentScore: number | null;
  }>;
  pipelinePending: boolean;
}>;

const mockNewsRows: Array<{
  id: string; title: string; summary: string | null; url: string;
  source: string; publisher: string | null; publishedAt: Date;
  sentiment: string | null; sentimentScore: number | null; symbols: string[];
}> = [];

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
    newsArticles: {},
  },
}));

describe('get_news — Phase 0.10', () => {
  beforeEach(() => {
    mockNewsRows.length = 0;
    vi.clearAllMocks();
    // Reset the mockFrom chain for each test
    mockFrom.mockReturnValue(mockFromChain);
  });

  it('returns pipelinePending: true when table is empty', async () => {
    mockLimit.mockResolvedValueOnce([]);  // main query empty
    mockLimit.mockResolvedValueOnce([]);  // probe query empty

    const result = await exec({});

    expect(result.pipelinePending).toBe(true);
    expect(result.items).toHaveLength(0);
  });

  it('validates input schema — limit min 1', () => {
    const schema = getNewsTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ limit: 1 }).success).toBe(true);
  });

  it('validates input schema — limit max 20', () => {
    const schema = getNewsTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ limit: 20 }).success).toBe(true);
    expect(schema.safeParse({ limit: 21 }).success).toBe(false);
  });

  it('validates input schema — limit defaults to 8', () => {
    const schema = getNewsTool.inputSchema as { safeParse: (v: unknown) => { success: boolean; data?: { limit: number } } };
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.data) expect(parsed.data.limit).toBe(8);
  });

  it('validates input schema — optional symbol filter', () => {
    const schema = getNewsTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD' }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'XAUUSD' }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'INVALID' }).success).toBe(false);
  });

  it('validates input schema — minSentiment range 0 to 1', () => {
    const schema = getNewsTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ minSentiment: 0 }).success).toBe(true);
    expect(schema.safeParse({ minSentiment: 1 }).success).toBe(true);
    expect(schema.safeParse({ minSentiment: 1.1 }).success).toBe(false);
    expect(schema.safeParse({ minSentiment: -0.1 }).success).toBe(false);
  });
});
