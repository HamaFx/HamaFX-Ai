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

import { computePositionHealthTool } from '../src/tools/compute-position-health';
import { withToolContext } from '../src/tool-context';

// The raw tool factory exposes `.execute` directly. The registry wraps it
// with telemetry, but for behavioral tests we want the pure logic.
const exec = computePositionHealthTool.execute as unknown as (
  input: { symbol?: string; limit?: number },
) => Promise<{
  asOf: number;
  rows: Array<{
    entryId: string;
    symbol: string;
    side: 'long' | 'short';
    openedAtMs: number;
    entry: number;
    stop: number | null;
    target: number | null;
    currentMid: number;
    pnlPips: number;
    pnlR: number | null;
    distanceToStopPips: number | null;
    distanceToTargetPips: number | null;
    aboutToHit: boolean;
  }>;
  partial: boolean;
  empty: boolean;
}>;

const mockListEntries = vi.fn();
const mockGetPrice = vi.fn();

vi.mock('../src/journal/persistence', () => ({
  listEntries: (...args: unknown[]) => mockListEntries(...args),
}));

vi.mock('@hamafx/data', () => ({
  getPrice: (...args: unknown[]) => mockGetPrice(...args),
}));

function runWithContext<T>(fn: () => Promise<T>): Promise<T> {
  return withToolContext(
    {
      threadId: '00000000-0000-0000-0000-000000000000',
      userId: '00000000-0000-0000-0000-000000000001',
      env: {
        AI_DEFAULT_MODEL: 'test-model',
        AI_EMBEDDING_MODEL: 'test-embedding',
        MAX_DAILY_USD: 10,
        LOG_PROMPTS: false,
      },
      signal: null,
      budget: { spent: 0, max: 10 },
      userSettings: {} as never,
    },
    fn,
  );
}

function makeEntry(overrides: {
  id?: string;
  symbol?: string;
  side?: 'long' | 'short';
  entry?: number;
  stop?: number | null;
  target?: number | null;
  outcome?: 'open' | 'win' | 'loss' | 'breakeven';
}): {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  openedAt: number;
  closedAt: number | null;
  entry: number;
  stop: number | null;
  target: number | null;
  exit: number | null;
  size: number | null;
  outcome: 'open' | 'win' | 'loss' | 'breakeven';
  rMultiple: number | null;
  notes: string | null;
  tags: string[];
  screenshotUrl: string | null;
  attachments: string[];
  createdAt: number;
  updatedAt: number;
} {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    symbol: 'EURUSD',
    side: 'long',
    openedAt: Date.now() - 3600_000,
    closedAt: null,
    entry: 1.08,
    stop: 1.075,
    target: 1.09,
    exit: null,
    size: 0.1,
    outcome: 'open',
    rMultiple: null,
    notes: null,
    tags: [],
    screenshotUrl: null,
    attachments: [],
    createdAt: Date.now() - 3600_000,
    updatedAt: Date.now() - 3600_000,
    ...overrides,
  };
}

describe('compute_position_health — Phase 0.9', () => {
  beforeEach(() => {
    mockListEntries.mockReset();
    mockGetPrice.mockReset();
  });

  it('returns empty when no open trades exist', async () => {
    mockListEntries.mockResolvedValue([]);

    const result = await runWithContext(() => exec({}));

    expect(result.empty).toBe(true);
    expect(result.rows).toHaveLength(0);
    expect(result.partial).toBe(false);
  });

  it('computes pips and R for a EURUSD long', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e1', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 }),
    ]);
    mockGetPrice.mockResolvedValue({ bid: 1.085, ask: 1.0851, mid: 1.08505, timestamp: Date.now() });

    const result = await runWithContext(() => exec({}));

    expect(result.empty).toBe(false);
    expect(result.partial).toBe(false);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    // mid 1.08505 - entry 1.08 = 0.00505 price units → 50.5 pips
    expect(row.pnlPips).toBeCloseTo(50.5, 6);
    // risk = |1.08 - 1.075| = 0.005 → R = 0.00505 / 0.005 = 1.01
    expect(row.pnlR).toBeCloseTo(1.01, 6);
    // distance to stop = |1.08505 - 1.075| / 0.0001 = 100.5 pips
    expect(row.distanceToStopPips).toBeCloseTo(100.5, 6);
    // distance to target = |1.08505 - 1.09| / 0.0001 = 49.5 pips
    expect(row.distanceToTargetPips).toBeCloseTo(49.5, 6);
    expect(row.aboutToHit).toBe(false);
  });

  it('computes gold pips correctly for XAUUSD', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({
        id: 'g1',
        symbol: 'XAUUSD',
        side: 'short',
        entry: 2400,
        stop: 2410,
        target: 2380,
      }),
    ]);
    mockGetPrice.mockResolvedValue({ bid: 2395, ask: 2395.1, mid: 2395.05, timestamp: Date.now() });

    const result = await runWithContext(() => exec({}));

    const row = result.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    // short: (entry - mid) / pipSize → (2400 - 2395.05) / 0.1 = 49.5 pips
    expect(row.pnlPips).toBeCloseTo(49.5, 6);
    // risk = 10, reward = 4.95 → R = 0.495
    expect(row.pnlR).toBeCloseTo(0.495, 6);
  });

  it('flags aboutToHit when within 5 pips of stop', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e2', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 }),
    ]);
    // mid is 1.07504 → 0.4 pips from stop (signed distance)
    mockGetPrice.mockResolvedValue({ bid: 1.075, ask: 1.07508, mid: 1.07504, timestamp: Date.now() });

    const result = await runWithContext(() => exec({}));

    const row = result.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.distanceToStopPips).toBeCloseTo(0.4, 6);
    expect(row.aboutToHit).toBe(true);
  });

  it('flags aboutToHit when within 5 pips of target', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e3', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 }),
    ]);
    // mid is 1.08996 → 0.4 pips from target (signed distance)
    mockGetPrice.mockResolvedValue({ bid: 1.0899, ask: 1.09002, mid: 1.08996, timestamp: Date.now() });

    const result = await runWithContext(() => exec({}));

    const row = result.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.distanceToTargetPips).toBeCloseTo(0.4, 6);
    expect(row.aboutToHit).toBe(true);
  });

  it('returns null R when stop is missing', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e4', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: null, target: 1.09 }),
    ]);
    mockGetPrice.mockResolvedValue({ bid: 1.085, ask: 1.0851, mid: 1.08505, timestamp: Date.now() });

    const result = await runWithContext(() => exec({}));

    const row = result.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.pnlR).toBeNull();
    expect(row.distanceToStopPips).toBeNull();
  });

  it('returns null target distance when target is missing', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e5', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: null }),
    ]);
    mockGetPrice.mockResolvedValue({ bid: 1.085, ask: 1.0851, mid: 1.08505, timestamp: Date.now() });

    const result = await runWithContext(() => exec({}));

    const row = result.rows[0];
    expect(row).toBeDefined();
    if (!row) return;

    expect(row.distanceToTargetPips).toBeNull();
  });

  it('sets partial: true when a price fetch fails', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e6', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 }),
      makeEntry({ id: 'e7', symbol: 'GBPUSD', side: 'long', entry: 1.27, stop: 1.265, target: 1.28 }),
    ]);
    mockGetPrice.mockImplementation(async (symbol: string) => {
      if (symbol === 'EURUSD') return { bid: 1.085, ask: 1.0851, mid: 1.08505, timestamp: Date.now() };
      throw new Error('provider down');
    });

    const result = await runWithContext(() => exec({}));

    expect(result.partial).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.symbol).toBe('EURUSD');
  });

  it('caches price per symbol', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e8', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 }),
      makeEntry({ id: 'e9', symbol: 'EURUSD', side: 'short', entry: 1.09, stop: 1.095, target: 1.08 }),
    ]);
    mockGetPrice.mockResolvedValue({ bid: 1.085, ask: 1.0851, mid: 1.08505, timestamp: Date.now() });

    await runWithContext(() => exec({}));

    expect(mockGetPrice).toHaveBeenCalledTimes(1);
    expect(mockGetPrice).toHaveBeenCalledWith('EURUSD');
  });

  it('filters by symbol when provided', async () => {
    mockListEntries.mockResolvedValue([
      makeEntry({ id: 'e10', symbol: 'EURUSD', side: 'long', entry: 1.08, stop: 1.075, target: 1.09 }),
    ]);
    mockGetPrice.mockResolvedValue({ bid: 1.085, ask: 1.0851, mid: 1.08505, timestamp: Date.now() });

    await runWithContext(() => exec({ symbol: 'EURUSD' }));

    expect(mockListEntries).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ symbol: 'EURUSD' }),
    );
  });
});
