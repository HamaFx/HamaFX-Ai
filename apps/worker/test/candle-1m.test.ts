// 1m candle aggregator tests. Pure data — no IO, no mocks. We feed
// crafted tick streams and assert the closed-bar shapes.

import { describe, expect, it } from 'vitest';

import { Candle1mAggregator, type ClosedCandle } from '../src/aggregator/candle-1m';
import type { NormalizedTick } from '../src/signalr/consumer';

const MINUTE_MS = 60_000;
const BASE_MIN = 28_000_000; // arbitrary minute bucket
const BASE_TS = BASE_MIN * MINUTE_MS;

function tick(symbol: NormalizedTick['symbol'], mid: number, tsOffsetMs: number): NormalizedTick {
  return {
    symbol,
    bid: mid - 0.05,
    ask: mid + 0.05,
    mid,
    ts: BASE_TS + tsOffsetMs,
    source: 'biquote-signalr',
  };
}

describe('Candle1mAggregator', () => {
  it('does not emit anything for ticks within the same minute', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, 0));
    agg.feed(tick('XAUUSD', 2391, 1_000));
    agg.feed(tick('XAUUSD', 2389, 30_000));
    agg.feed(tick('XAUUSD', 2390.5, 59_999));

    expect(closed).toHaveLength(0);
    const open = agg.peek('XAUUSD');
    expect(open?.o).toBe(2390);
    expect(open?.c).toBe(2390.5);
    expect(open?.h).toBe(2391);
    expect(open?.l).toBe(2389);
    expect(open?.ticks).toBe(4);
  });

  it('emits a closed bar on minute rollover with correct OHLC', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, 0));
    agg.feed(tick('XAUUSD', 2391, 30_000));
    // Roll into the next minute.
    agg.feed(tick('XAUUSD', 2392, MINUTE_MS + 5_000));

    expect(closed).toHaveLength(1);
    const bar = closed[0]!;
    expect(bar.symbol).toBe('XAUUSD');
    expect(bar.t).toBe(BASE_TS); // bar OPEN time, aligned to minute
    expect(bar.o).toBe(2390); // first tick mid
    expect(bar.c).toBe(2391); // last tick mid in the closing minute
    expect(bar.h).toBe(2391);
    expect(bar.l).toBe(2390);
    expect(bar.tickVolume).toBe(2);
    expect(bar.v).toBeNull();
    expect(bar.source).toBe('biquote-signalr');
  });

  it('starts a fresh bar for the new minute with the rollover tick as open', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, 0));
    agg.feed(tick('XAUUSD', 2392, MINUTE_MS + 1_000));

    const open = agg.peek('XAUUSD');
    expect(open?.o).toBe(2392);
    expect(open?.c).toBe(2392);
    expect(open?.h).toBe(2392);
    expect(open?.l).toBe(2392);
    expect(open?.ticks).toBe(1);
  });

  it('keeps separate bars per symbol', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, 0));
    agg.feed(tick('EURUSD', 1.085, 0));
    agg.feed(tick('GBPUSD', 1.27, 0));

    expect(agg.peek('XAUUSD')?.o).toBe(2390);
    expect(agg.peek('EURUSD')?.o).toBe(1.085);
    expect(agg.peek('GBPUSD')?.o).toBe(1.27);
    expect(closed).toHaveLength(0);
  });

  it('emits one closed bar (not gap-filled) when minutes are skipped', () => {
    // Simulates a BiQuote outage: the next tick lands 5 minutes later.
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, 0));
    agg.feed(tick('XAUUSD', 2400, 5 * MINUTE_MS + 1_000));

    expect(closed).toHaveLength(1);
    expect(closed[0]?.t).toBe(BASE_TS);
    expect(closed[0]?.c).toBe(2390); // last tick of the closing minute

    const open = agg.peek('XAUUSD');
    expect(open?.o).toBe(2400);
  });

  it('ignores stale (out-of-order) ticks from earlier minutes', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, MINUTE_MS)); // minute 1 opens
    agg.feed(tick('XAUUSD', 2391, MINUTE_MS + 30_000)); // still minute 1
    agg.feed(tick('XAUUSD', 9999, 100)); // stale — minute 0
    agg.feed(tick('XAUUSD', 2392, 2 * MINUTE_MS + 5_000)); // rollover

    expect(closed).toHaveLength(1);
    const bar = closed[0]!;
    expect(bar.h).toBe(2391); // 9999 was ignored
    expect(bar.l).toBe(2390);
    expect(bar.tickVolume).toBe(2);
  });

  it('closeAll() flushes the open bar(s) and clears state', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    agg.feed(tick('XAUUSD', 2390, 0));
    agg.feed(tick('EURUSD', 1.085, 0));

    agg.closeAll();
    expect(closed).toHaveLength(2);
    expect(agg.peek('XAUUSD')).toBeUndefined();
    expect(agg.peek('EURUSD')).toBeUndefined();

    // Idempotent — a second call is a no-op.
    agg.closeAll();
    expect(closed).toHaveLength(2);
  });

  it('open time is aligned to the start of the minute regardless of first-tick offset', () => {
    const closed: ClosedCandle[] = [];
    const agg = new Candle1mAggregator((b) => closed.push(b));

    // First tick lands 42s into the minute.
    agg.feed(tick('XAUUSD', 2390, 42_000));
    // Rollover.
    agg.feed(tick('XAUUSD', 2400, MINUTE_MS + 1_000));

    expect(closed[0]?.t).toBe(BASE_TS);
  });
});
