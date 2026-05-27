// Property-shaped checks for the replay_setup tool's pure-logic core. We
// inject a stub `getCandles` via vi.mock so the test runs without
// touching any live provider — these tests exercise the trade-simulation
// / R-multiple math, not the data layer.

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Candle } from '@hamafx/shared';

vi.mock('@hamafx/data', () => ({
  getCandles: vi.fn(),
}));

import { getCandles } from '@hamafx/data';

import { replaySetupTool } from '../src/tools/replay-setup';

const exec = replaySetupTool.execute as unknown as (input: unknown) => Promise<{
  count: number;
  wins: number;
  losses: number;
  hitRate: number;
  avgR: number;
  totalR: number;
  thin: boolean;
  trades: Array<{ rMultiple: number; reason: 'tp' | 'sl' | 'time' }>;
}>;

function bar(o: number, h: number, l: number, c: number, t: number): Candle {
  return {
    symbol: 'EURUSD',
    tf: '1h',
    t,
    o,
    h,
    l,
    c,
    v: null,
    source: 'test',
    fetchedAt: 0,
  };
}

afterEach(() => {
  vi.mocked(getCandles).mockReset();
});

describe('replay_setup — pure logic', () => {
  it('returns thin=true and zero trades when there are no candles', async () => {
    vi.mocked(getCandles).mockResolvedValueOnce([] as Candle[]);
    const r = await exec({
      symbol: 'EURUSD',
      tf: '1h',
      windowBars: 100,
      rule: { kind: 'rsi_threshold', period: 14, threshold: 30, side: 'long' },
      exit: { unit: 'atr', stopMult: 1.5, targetMult: 2, maxBars: 100 },
    });
    expect(r.count).toBe(0);
    expect(r.thin).toBe(true);
    expect(r.trades).toEqual([]);
  });

  it('treats a no-signal series as zero trades, not zero wins', async () => {
    // Flat candles → RSI ≈ neutral, no crossings → no signals.
    const flat: Candle[] = Array.from({ length: 200 }, (_, i) =>
      bar(1.08, 1.0801, 1.0799, 1.08, 1_700_000_000_000 + i * 60_000),
    );
    vi.mocked(getCandles).mockResolvedValueOnce(flat);
    const r = await exec({
      symbol: 'EURUSD',
      tf: '1h',
      windowBars: 200,
      rule: { kind: 'rsi_threshold', period: 14, threshold: 30, side: 'long' },
      exit: { unit: 'pips', stopMult: 1.5, targetMult: 2, stopPips: 10, targetPips: 20, maxBars: 100 },
    });
    expect(r.count).toBe(0);
    expect(r.hitRate).toBe(0);
    expect(r.totalR).toBe(0);
  });

  it('records a winning trade when target is hit before stop', async () => {
    // Build a series where the entry index is exactly where we know
    // RSI(14) crossed up through 30, then price runs straight up to
    // hit the +20 pip target before any drawdown.
    // Easier: use ema_cross with deterministic data.
    const seq: Candle[] = [];
    let t = 1_700_000_000_000;
    // 60 declining bars to put fast<slow.
    for (let i = 0; i < 60; i += 1) {
      const c = 1.10 - i * 0.0005;
      seq.push(bar(c, c + 0.0001, c - 0.0001, c, t));
      t += 60 * 60_000;
    }
    // 20 sharply rising bars → fast crosses slow upward.
    for (let i = 0; i < 20; i += 1) {
      const c = 1.07 + i * 0.0010;
      seq.push(bar(c, c + 0.0010, c - 0.00005, c, t));
      t += 60 * 60_000;
    }
    // 10 more bars climbing further so the +20p target is reached.
    for (let i = 0; i < 10; i += 1) {
      const c = 1.09 + i * 0.0005;
      seq.push(bar(c, c + 0.001, c - 0.00005, c, t));
      t += 60 * 60_000;
    }

    vi.mocked(getCandles).mockResolvedValueOnce(seq);
    const r = await exec({
      symbol: 'EURUSD',
      tf: '1h',
      windowBars: seq.length,
      rule: { kind: 'ema_cross', fast: 5, slow: 20, side: 'long' },
      exit: {
        unit: 'pips',
        stopMult: 1.5,
        targetMult: 2,
        stopPips: 50,
        targetPips: 20,
        maxBars: 30,
      },
    });
    // At least one trade and at least one TP exit.
    expect(r.count).toBeGreaterThan(0);
    expect(r.trades.some((t) => t.reason === 'tp')).toBe(true);
    expect(r.totalR).toBeGreaterThan(0);
  });
});
