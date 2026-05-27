import { describe, expect, it } from 'vitest';

import type { NormalizedTick } from '../src/signalr/consumer';
import { TickBuffer } from '../src/signalr/tick-buffer';

function tick(symbol: NormalizedTick['symbol'], mid: number, ts = 0): NormalizedTick {
  return {
    symbol,
    bid: mid - 0.05,
    ask: mid + 0.05,
    mid,
    ts: ts || Date.now(),
    source: 'biquote-signalr',
  };
}

describe('TickBuffer', () => {
  it('starts empty', () => {
    const buf = new TickBuffer();
    expect(buf.size()).toBe(0);
    expect(buf.drain()).toEqual([]);
  });

  it('coalesces multiple ticks per symbol to the latest', () => {
    const buf = new TickBuffer();
    buf.push(tick('XAUUSD', 2390));
    buf.push(tick('XAUUSD', 2391));
    buf.push(tick('XAUUSD', 2392));
    expect(buf.size()).toBe(1);
    const drained = buf.drain();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.tick.mid).toBe(2392);
    expect(drained[0]?.observed).toBe(3);
  });

  it('keeps a separate slot per symbol', () => {
    const buf = new TickBuffer();
    buf.push(tick('XAUUSD', 2390));
    buf.push(tick('EURUSD', 1.085));
    buf.push(tick('GBPUSD', 1.27));
    expect(buf.size()).toBe(3);
    const drained = buf.drain();
    expect(drained.map((d) => d.tick.symbol).sort()).toEqual(['EURUSD', 'GBPUSD', 'XAUUSD']);
  });

  it('clears after drain', () => {
    const buf = new TickBuffer();
    buf.push(tick('XAUUSD', 2390));
    buf.drain();
    expect(buf.size()).toBe(0);
    expect(buf.drain()).toEqual([]);
  });
});
