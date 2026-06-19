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

// Tests for the candles_1m INSERT writer.

import { describe, expect, it, vi } from 'vitest';

import type { ClosedCandle } from '../src/aggregator/candle-1m';
import { createLogger } from '../src/log';
import { flushClosedCandle, type FlushClosedCandleArgs } from '../src/persistence/candles-1m';

const log = createLogger({ service: 'test', forceJson: true });

interface CapturedRow {
  values: Record<string, unknown> | null;
  conflictDoNothingCalled: boolean;
}

function makeFakeDb(): { db: FlushClosedCandleArgs['db']; captured: CapturedRow } {
  const captured: CapturedRow = { values: null, conflictDoNothingCalled: false };
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => ({
        onConflictDoNothing: vi.fn(async () => {
          captured.values = row;
          captured.conflictDoNothingCalled = true;
        }),
      })),
    })),
  } as unknown as FlushClosedCandleArgs['db'];
  return { db, captured };
}

const BAR: ClosedCandle = {
  symbol: 'XAUUSD',
  t: 1_700_000_000_000,
  o: 2390,
  h: 2391,
  l: 2389,
  c: 2390.5,
  v: null,
  tickVolume: 47,
  source: 'biquote-signalr',
};

describe('flushClosedCandle', () => {
  it('inserts the bar with ON CONFLICT DO NOTHING (idempotent)', async () => {
    const { db, captured } = makeFakeDb();
    await flushClosedCandle({ db, log, bar: BAR });

    expect(captured.conflictDoNothingCalled).toBe(true);
    expect(captured.values).not.toBeNull();
    const v = captured.values!;
    expect(v['symbol']).toBe('XAUUSD');
    expect(v['t']).toBeInstanceOf(Date);
    expect((v['t'] as Date).getTime()).toBe(BAR.t);
    expect(v['o']).toBe(2390);
    expect(v['c']).toBe(2390.5);
    expect(v['v']).toBeNull();
    expect(v['tickVolume']).toBe(47);
    expect(v['source']).toBe('biquote-signalr');
  });

  it('preserves all OHLC values exactly (no rounding)', async () => {
    const { db, captured } = makeFakeDb();
    const bar: ClosedCandle = { ...BAR, o: 2390.123456, h: 2391.987654, l: 2389.000001 };
    await flushClosedCandle({ db, log, bar });

    expect(captured.values?.['o']).toBe(2390.123456);
    expect(captured.values?.['h']).toBe(2391.987654);
    expect(captured.values?.['l']).toBe(2389.000001);
  });
});
