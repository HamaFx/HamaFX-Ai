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

import { analyzeFundamentalTool } from '../src/tools/analyze-fundamental';

const exec = analyzeFundamentalTool.execute as unknown as (
  input: { symbol: string; horizonHours?: number },
) => Promise<{
  symbol: string;
  windowFromMs: number;
  windowToMs: number;
  currencies: string[];
  events: Array<{
    id: string;
    title: string;
    country: string;
    currency: string | null;
    importance: string;
    date: number;
    actual: string | null;
    forecast: string | null;
    previous: string | null;
    unit: string | null;
    source: string | null;
  }>;
  headlines: Array<{
    id: string;
    title: string;
    summary: string | null;
    url: string;
    source: string;
    publisher: string | null;
    publishedAt: number;
    sentiment: string | null;
    sentimentScore: number | null;
  }>;
  sentiment: { positive: number; negative: number; neutral: number };
  summary: string;
  pipelinePending: boolean;
}>;

const mockEventRows: Array<{
  id: string;
  title: string;
  country: string;
  currency: string;
  importance: string;
  date: Date;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  source: string | null;
}> = [];

const mockNewsRows: Array<{
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publisher: string | null;
  publishedAt: Date;
  sentiment: string | null;
  sentimentScore: number | null;
  symbols: string[];
}> = [];

// The tool uses two query chains:
//   events:  .select().from().where().orderBy() → Promise<events>
//   news:    .select().from().where().orderBy().limit() → Promise<news>
//
// After .where(), both chains call .orderBy(). For events it resolves directly;
// for news it returns something with .limit(). We create a shared orderBy result
// that is both a Promise (for events) AND has a .limit() method (for news).

function createOrderByResult() {
  const eventsPromise = Promise.resolve(mockEventRows);
  const newsPromise = Promise.resolve(mockNewsRows);

  return Object.assign(eventsPromise, {
    limit: (_n: number) => newsPromise,
  });
}

let orderByResult = createOrderByResult();

const whereResult = {
  orderBy: vi.fn().mockReturnValue(orderByResult),
};

const fromResult = {
  where: vi.fn().mockReturnValue(whereResult),
};

vi.mock('@hamafx/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => fromResult),
    })),
  })),
  schema: {
    economicEvents: {},
    newsArticles: {},
  },
}));

describe('analyze_fundamental — Phase 0.10', () => {
  beforeEach(() => {
    mockEventRows.length = 0;
    mockNewsRows.length = 0;
    orderByResult = createOrderByResult();
    whereResult.orderBy.mockReturnValue(orderByResult);
  });

  // When calling execute() directly (bypassing the AI SDK tool wrapper),
  // Zod .default(24) is NOT applied — we must pass horizonHours explicitly.

  it('returns pipelinePending: true when both events and headlines are empty', async () => {
    const result = await exec({ symbol: 'EURUSD', horizonHours: 24 });

    expect(result.pipelinePending).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(result.headlines).toHaveLength(0);
    expect(result.sentiment).toEqual({ positive: 0, negative: 0, neutral: 0 });
    expect(result.summary).toMatch(/pipelines/i);
  });

  it('returns the correct currencies for EURUSD', async () => {
    const result = await exec({ symbol: 'EURUSD', horizonHours: 24 });

    expect(result.currencies).toEqual(['EUR', 'USD']);
  });

  it('returns the correct currencies for GBPUSD', async () => {
    const result = await exec({ symbol: 'GBPUSD', horizonHours: 24 });

    expect(result.currencies).toEqual(['GBP', 'USD']);
  });

  it('returns the correct currencies for XAUUSD', async () => {
    const result = await exec({ symbol: 'XAUUSD', horizonHours: 24 });

    expect(result.currencies).toEqual(['USD']);
  });

  it('computes the correct time window', async () => {
    const before = Date.now();

    const result = await exec({ symbol: 'EURUSD', horizonHours: 24 });

    expect(result.windowFromMs).toBeGreaterThanOrEqual(before);
    expect(result.windowToMs).toBe(result.windowFromMs + 24 * 60 * 60 * 1000);
  });

  it('respects custom horizonHours', async () => {
    const result = await exec({ symbol: 'EURUSD', horizonHours: 6 });

    const diff = result.windowToMs - result.windowFromMs;
    expect(diff).toBe(6 * 60 * 60 * 1000);
  });

  it('computes a 24h window when horizonHours is 24', async () => {
    const result = await exec({ symbol: 'EURUSD', horizonHours: 24 });

    const diff = result.windowToMs - result.windowFromMs;
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('validates input schema — horizonHours min 1', () => {
    const schema = analyzeFundamentalTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', horizonHours: 0 }).success).toBe(false);
    expect(schema.safeParse({ symbol: 'EURUSD', horizonHours: 1 }).success).toBe(true);
  });

  it('validates input schema — horizonHours max 168', () => {
    const schema = analyzeFundamentalTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ symbol: 'EURUSD', horizonHours: 168 }).success).toBe(true);
    expect(schema.safeParse({ symbol: 'EURUSD', horizonHours: 169 }).success).toBe(false);
  });

  it('validates input schema — required symbol', () => {
    const schema = analyzeFundamentalTool.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ symbol: 'EURUSD' }).success).toBe(true);
  });

  it('returns a descriptive summary when pipeline is pending', async () => {
    const result = await exec({ symbol: 'GBPUSD', horizonHours: 24 });

    expect(result.pipelinePending).toBe(true);
    expect(result.summary).toContain('pipelines');
  });

  it('always returns positive, negative, neutral integer counts starting at 0', async () => {
    const result = await exec({ symbol: 'EURUSD', horizonHours: 24 });

    expect(Number.isInteger(result.sentiment.positive)).toBe(true);
    expect(Number.isInteger(result.sentiment.negative)).toBe(true);
    expect(Number.isInteger(result.sentiment.neutral)).toBe(true);
    expect(result.sentiment.positive).toBeGreaterThanOrEqual(0);
    expect(result.sentiment.negative).toBeGreaterThanOrEqual(0);
    expect(result.sentiment.neutral).toBeGreaterThanOrEqual(0);
  });
});
