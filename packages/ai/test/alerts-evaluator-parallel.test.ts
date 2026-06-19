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

// Phase 2 hardening §9 — readings prefetched in parallel.
//
// We mock `getPrice` / `getCandles` with controllable delays and assert
// that wall-time scales as max(rule_latency) rather than sum(rule_latency).

import type { Tick } from '@hamafx/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/data', () => ({
  getPrice: vi.fn(),
  getCandles: vi.fn(),
}));

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
    // Phase A: the evaluator now joins users + userSettings to pull per-user
    // delivery config. The chain must support .from().leftJoin().where()
    // and return an empty array — the test doesn't care about per-user
    // delivery, only about the read-prefetch parallelism below.
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve([]),
        }),
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
  }),
  schema: {
    alerts: { id: 'id', active: 'active', firedAt: 'fired_at', createdAt: 'created_at' },
    users: { id: 'id', email: 'email' },
    userSettings: {
      userId: 'user_id',
      alertEmail: 'alert_email',
      telegramBotToken: 'telegram_bot_token',
      telegramChatId: 'telegram_chat_id',
    },
  },
}));

vi.mock('../src/alerts/persistence', () => ({
  listEvaluable: vi.fn(),
  setRulePreviousValue: vi.fn(async () => undefined),
  markFired: vi.fn(async () => undefined),
}));

vi.mock('../src/alerts/delivery', () => ({
  deliverAlert: vi.fn(async ({ alert }: { alert: { id: string } }) => ({
    alertId: alert.id,
    channel: 'email',
    ok: true,
  })),
}));

import { getCandles, getPrice } from '@hamafx/data';

import { evaluateAlerts } from '../src/alerts/evaluator';
import { listEvaluable } from '../src/alerts/persistence';

function makeAlert(id: string, sym: string = 'XAUUSD'): {
  id: string;
  rule: {
    type: 'priceCross';
    symbol: string;
    direction: 'above';
    level: number;
  };
  channels: string[];
  note: null;
  active: boolean;
  firedAt: null;
  createdAt: number;
} {
  return {
    id,
    rule: { type: 'priceCross', symbol: sym, direction: 'above', level: 0 },
    channels: ['email'],
    note: null,
    active: true,
    firedAt: null,
    createdAt: Date.now(),
  };
}

describe('evaluateAlerts — parallel readings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(getPrice).mockReset();
    vi.mocked(getCandles).mockReset();
  });

  it('reads inputs concurrently across alerts', async () => {
    const alerts = Array.from({ length: 30 }, (_, i) => makeAlert(`a${i}`, `SYM${i}` as string));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(listEvaluable).mockResolvedValue(alerts as any);

    // Each getPrice call sleeps 100 ms. Sequentially that's 3 s for 30
    // alerts; concurrently it should be roughly 100 ms.
    let activeAtPeak = 0;
    let active = 0;
    vi.mocked(getPrice).mockImplementation(async () => {
      active += 1;
      activeAtPeak = Math.max(activeAtPeak, active);
      await new Promise((r) => setTimeout(r, 100));
      active -= 1;
      return {
        symbol: 'XAUUSD',
        bid: 2390,
        ask: 2390,
        mid: 2390,
        ts: Date.now(),
        source: 'test',
      } as Tick;
    });

    const promise = evaluateAlerts();
    // Advance through the 100 ms window. With concurrent reads, all
    // 30 promises hit `setTimeout` simultaneously and then resolve
    // together.
    await vi.advanceTimersByTimeAsync(120);
    const result = await promise;

    expect(result.total).toBe(30);
    // Confirm the read actually fanned out — at least 5 in flight at once.
    expect(activeAtPeak).toBeGreaterThanOrEqual(5);
  });

  it('records errors per-alert without aborting siblings', async () => {
    const alerts = [makeAlert('ok', 'SYM1' as string), makeAlert('bad', 'SYM2' as string), makeAlert('also-ok', 'SYM3' as string)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(listEvaluable).mockResolvedValue(alerts as any);

    vi.mocked(getPrice).mockImplementation(async (s) => {
      void s;
      // Fail for the second alert specifically. Since we can't tell
      // which is which from getPrice args, key on call count.
      const callCount = vi.mocked(getPrice).mock.calls.length;
      if (callCount === 2) throw new Error('upstream blew up');
      return {
        symbol: 'XAUUSD',
        bid: 2390,
        ask: 2390,
        mid: 2390,
        ts: Date.now(),
        source: 'test',
      } as Tick;
    });
    // satisfy the import
    void getCandles;

    const promise = evaluateAlerts();
    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;

    expect(result.total).toBe(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.alertId).toBe('bad');
    // The other two alerts were still evaluated and matched (level=0).
    expect(result.matched).toBe(2);
  });
});
