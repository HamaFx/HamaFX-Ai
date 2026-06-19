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
