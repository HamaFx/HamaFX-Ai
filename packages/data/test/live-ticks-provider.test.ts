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

// Tests for the live_ticks pseudo-provider. We inject a fake drizzle-shaped
// db so no Postgres is required.

import { describe, expect, it, vi } from 'vitest';

import { ProviderEmptyError } from '../src/errors';
import { fetchLiveTick } from '../src/providers/live-ticks';

function makeFakeDb(rows: Array<{ mid: number; ts: Date; source: string }>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => rows),
        })),
      })),
    })),
  } as unknown as NonNullable<Parameters<typeof fetchLiveTick>[0]['db']>;
}

describe('fetchLiveTick', () => {
  it('returns the latest mid + worker source + ageMs when a fresh row exists', async () => {
    const ts = new Date();
    const db = makeFakeDb([{ mid: 2390.5, ts, source: 'biquote-signalr' }]);

    const r = await fetchLiveTick({ symbol: 'XAUUSD', db });
    expect(r.price).toBe(2390.5);
    expect(r.provider).toBe('biquote-signalr');
    expect(r.ts).toBe(ts.getTime());
    expect(r.ageMs).toBeGreaterThanOrEqual(0);
    expect(r.ageMs).toBeLessThan(1_000);
  });

  it('throws ProviderEmptyError (not ProviderError) when no fresh row exists', async () => {
    const db = makeFakeDb([]);

    await expect(fetchLiveTick({ symbol: 'XAUUSD', db })).rejects.toBeInstanceOf(
      ProviderEmptyError,
    );
  });

  it('forwards the worker-recorded source string to consumers', async () => {
    const db = makeFakeDb([
      { mid: 1.27, ts: new Date(), source: 'biquote-rest' },
    ]);
    const r = await fetchLiveTick({ symbol: 'GBPUSD', db });
    expect(r.provider).toBe('biquote-rest');
  });

  it('honours a custom maxAgeMs (test injection point)', async () => {
    const db = makeFakeDb([]);
    await expect(
      fetchLiveTick({ symbol: 'EURUSD', db, maxAgeMs: 1_000 }),
    ).rejects.toMatchObject({
      provider: 'live-ticks',
      message: expect.stringContaining('1000ms') as unknown as string,
    });
  });
});
