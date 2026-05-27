// SignalR consumer tests. We inject a fake `MinimalHubConnection` so no
// network IO happens and the tick handler is fully observable.

import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '../src/log';
import {
  SignalRConsumer,
  type BuildConnection,
  type MinimalHubConnection,
  type NormalizedTick,
} from '../src/signalr/consumer';

const VALID_BIQUOTE_TICK = {
  symbol: 'XAUUSD',
  description: 'Gold vs US Dollar',
  bid: 2390.12,
  ask: 2390.32,
  last: 2390.22,
  volume: 0,
  time: '2026-05-27T18:35:01Z',
  source: 'MT5',
  type: 'Forex',
};

interface FakeConnectionState {
  startCalls: number;
  stopCalls: number;
  invokes: Array<{ method: string; args: unknown[] }>;
  receiveTickHandler: ((...a: unknown[]) => void) | null;
  reconnectingHandler: ((err?: unknown) => void) | null;
  reconnectedHandler: ((id?: string) => void) | null;
  closeHandler: ((err?: unknown) => void) | null;
}

function createFakeBuildConnection(): {
  build: BuildConnection;
  state: FakeConnectionState;
  connection: MinimalHubConnection;
} {
  const state: FakeConnectionState = {
    startCalls: 0,
    stopCalls: 0,
    invokes: [],
    receiveTickHandler: null,
    reconnectingHandler: null,
    reconnectedHandler: null,
    closeHandler: null,
  };

  const connection: MinimalHubConnection = {
    start: vi.fn(async () => {
      state.startCalls += 1;
    }) as unknown as MinimalHubConnection['start'],
    stop: vi.fn(async () => {
      state.stopCalls += 1;
    }) as unknown as MinimalHubConnection['stop'],
    invoke: vi.fn(async (method: string, ...args: unknown[]) => {
      state.invokes.push({ method, args });
    }) as unknown as MinimalHubConnection['invoke'],
    on: (method, handler) => {
      if (method === 'ReceiveTick') state.receiveTickHandler = handler;
    },
    off: () => undefined,
    onreconnecting: (h) => {
      state.reconnectingHandler = h;
    },
    onreconnected: (h) => {
      state.reconnectedHandler = h;
    },
    onclose: (h) => {
      state.closeHandler = h;
    },
  };

  const build: BuildConnection = () => connection;
  return { build, state, connection };
}

const log = createLogger({ service: 'test', forceJson: true });

describe('SignalRConsumer.start', () => {
  it('opens the hub and subscribes to all 3 symbols', async () => {
    const { build, state } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      buildConnection: build,
      log,
    });

    await consumer.start();

    expect(state.startCalls).toBe(1);
    expect(state.invokes).toContainEqual({
      method: 'Subscribe',
      args: [['XAUUSD', 'EURUSD', 'GBPUSD']],
    });
    expect(consumer.isStarted()).toBe(true);
  });

  it('honors a caller-provided symbol list', async () => {
    const { build, state } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      symbols: ['XAUUSD'],
      onTick: () => undefined,
      buildConnection: build,
      log,
    });
    await consumer.start();
    expect(state.invokes[0]?.args).toEqual([['XAUUSD']]);
  });

  it('is idempotent — calling start twice does not re-open or re-subscribe', async () => {
    const { build, state } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      buildConnection: build,
      log,
    });
    await consumer.start();
    await consumer.start();
    expect(state.startCalls).toBe(1);
    expect(state.invokes.filter((i) => i.method === 'Subscribe')).toHaveLength(1);
  });
});

describe('SignalRConsumer.handleTick', () => {
  it('dispatches a normalised tick on a valid payload', async () => {
    const ticks: NormalizedTick[] = [];
    const { build } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: (t) => ticks.push(t),
      buildConnection: build,
      log,
    });
    await consumer.start();

    consumer.handleTick(VALID_BIQUOTE_TICK);

    expect(ticks).toHaveLength(1);
    const t = ticks[0]!;
    expect(t.symbol).toBe('XAUUSD');
    expect(t.bid).toBeCloseTo(2390.12);
    expect(t.ask).toBeCloseTo(2390.32);
    expect(t.mid).toBeCloseTo(2390.22);
    expect(t.source).toBe('biquote-signalr');
    expect(t.ts).toBe(Date.parse('2026-05-27T18:35:01Z'));
  });

  it('drops ticks that fail schema validation (no onTick call)', async () => {
    const onTick = vi.fn();
    const { build } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick,
      buildConnection: build,
      log,
    });
    await consumer.start();

    consumer.handleTick({ malformed: true });
    consumer.handleTick(null);
    consumer.handleTick({ ...VALID_BIQUOTE_TICK, source: 'YAHOO' });

    expect(onTick).not.toHaveBeenCalled();
  });

  it('drops ticks for symbols outside the supported set', async () => {
    const onTick = vi.fn();
    const { build } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick,
      buildConnection: build,
      log,
    });
    await consumer.start();

    // BiquoteTickSchema accepts any string symbol, but our consumer drops
    // anything that isn't one of XAUUSD/EURUSD/GBPUSD.
    consumer.handleTick({ ...VALID_BIQUOTE_TICK, symbol: 'BTCUSD' });
    expect(onTick).not.toHaveBeenCalled();
  });

  it('swallows handler errors so a buggy onTick does not kill the stream', async () => {
    const { build } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => {
        throw new Error('boom');
      },
      buildConnection: build,
      log,
    });
    await consumer.start();

    expect(() => consumer.handleTick(VALID_BIQUOTE_TICK)).not.toThrow();
  });

  it('fires onActivity alongside onTick for healthchecks', async () => {
    const onActivity = vi.fn();
    const { build } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      onActivity,
      buildConnection: build,
      log,
    });
    await consumer.start();

    consumer.handleTick(VALID_BIQUOTE_TICK);
    expect(onActivity).toHaveBeenCalledTimes(1);
  });
});

describe('SignalRConsumer reconnect', () => {
  it('resubscribes when the hub fires onreconnected', async () => {
    const { build, state } = createFakeBuildConnection();
    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      buildConnection: build,
      log,
    });
    await consumer.start();
    state.invokes.length = 0; // clear the initial Subscribe

    state.reconnectedHandler?.();
    // resubscribe is async; flush microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(state.invokes.some((i) => i.method === 'Subscribe')).toBe(true);
  });
});
