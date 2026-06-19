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

// Tests for the live_ticks UPSERT writer. We inject a fake drizzle-shaped
// db to capture the SQL chain without touching Postgres.

import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../src/log';
import { flushLiveTicks, type LiveTicksWriterArgs } from '../src/persistence/live-ticks';
import type { NormalizedTick } from '../src/signalr/consumer';
import { TickBuffer } from '../src/signalr/tick-buffer';

const log = createLogger({ service: 'test', forceJson: true });

interface CapturedCall {
  rows: Array<Record<string, unknown>>;
  conflictConfig: Record<string, unknown> | null;
}

function makeFakeDb(): {
  db: LiveTicksWriterArgs['db'];
  captured: CapturedCall;
} {
  const captured: CapturedCall = { rows: [], conflictConfig: null };
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((rows: Array<Record<string, unknown>>) => ({
        onConflictDoUpdate: vi.fn(async (config: Record<string, unknown>) => {
          captured.rows = rows;
          captured.conflictConfig = config;
          return undefined;
        }),
      })),
    })),
  } as unknown as LiveTicksWriterArgs['db'];
  return { db, captured };
}

function tick(symbol: NormalizedTick['symbol'], mid: number, ts = 1_700_000_000_000): NormalizedTick {
  return {
    symbol,
    bid: mid - 0.05,
    ask: mid + 0.05,
    mid,
    ts,
    source: 'biquote-signalr',
  };
}

describe('flushLiveTicks', () => {
  it('returns 0/0 with no DB call when the buffer is empty', async () => {
    const { db } = makeFakeDb();
    const buffer = new TickBuffer();

    const r = await flushLiveTicks({ db, buffer, log });
    expect(r).toEqual({ written: 0, totalTicks: 0 });
  });

  it('UPSERTs one row per buffered symbol', async () => {
    const { db, captured } = makeFakeDb();
    const buffer = new TickBuffer();
    buffer.push(tick('XAUUSD', 2390));
    buffer.push(tick('EURUSD', 1.085));
    buffer.push(tick('GBPUSD', 1.27));

    const r = await flushLiveTicks({ db, buffer, log });

    expect(r.written).toBe(3);
    expect(captured.rows).toHaveLength(3);
    const symbols = captured.rows.map((row) => row['symbol']).sort();
    expect(symbols).toEqual(['EURUSD', 'GBPUSD', 'XAUUSD']);

    // ts is converted to Date for the timestamptz column
    for (const row of captured.rows) {
      expect(row['ts']).toBeInstanceOf(Date);
      expect(row['source']).toBe('biquote-signalr');
    }
  });

  it('reports total observed ticks across all symbols', async () => {
    const { db } = makeFakeDb();
    const buffer = new TickBuffer();
    buffer.push(tick('XAUUSD', 2390));
    buffer.push(tick('XAUUSD', 2391));
    buffer.push(tick('XAUUSD', 2392));
    buffer.push(tick('EURUSD', 1.085));

    const r = await flushLiveTicks({ db, buffer, log });
    expect(r.written).toBe(2);
    expect(r.totalTicks).toBe(4);
  });

  it('clears the buffer after a successful flush', async () => {
    const { db } = makeFakeDb();
    const buffer = new TickBuffer();
    buffer.push(tick('XAUUSD', 2390));

    await flushLiveTicks({ db, buffer, log });
    expect(buffer.size()).toBe(0);
  });

  it('configures ON CONFLICT to update bid/ask/mid/ts/source', async () => {
    const { db, captured } = makeFakeDb();
    const buffer = new TickBuffer();
    buffer.push(tick('XAUUSD', 2390));

    await flushLiveTicks({ db, buffer, log });
    expect(captured.conflictConfig).not.toBeNull();
    const set = (captured.conflictConfig as { set: Record<string, unknown> }).set;
    expect(Object.keys(set).sort()).toEqual([
      'ask',
      'bid',
      'mid',
      'source',
      'ts',
      'updatedAt',
    ]);
  });
});
