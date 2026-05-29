// Phase 2 hardening §1 — manual rebuild loop tests.
//
// The SignalR SDK gives up reconnecting after exhausting its
// `withAutomaticReconnect` schedule and fires `onclose`. The consumer
// catches that, schedules a manual rebuild on a jittered backoff, and
// keeps trying until either `stop()` is called or `start()` succeeds.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../src/log';
import {
  SignalRConsumer,
  type BuildConnection,
  type MinimalHubConnection,
} from '../src/signalr/consumer';

interface FakeHub {
  startCalls: number;
  startReject: Error | null;
  closeHandler: ((err?: unknown) => void) | null;
  reconnectingHandler: ((err?: unknown) => void) | null;
  reconnectedHandler: ((id?: string) => void) | null;
  receiveTickHandler: ((...a: unknown[]) => void) | null;
}

function makeHub(state: FakeHub): MinimalHubConnection {
  return {
    start: vi.fn(async () => {
      state.startCalls += 1;
      if (state.startReject) throw state.startReject;
    }) as unknown as MinimalHubConnection['start'],
    stop: vi.fn(async () => undefined) as unknown as MinimalHubConnection['stop'],
    invoke: vi.fn(async () => undefined) as unknown as MinimalHubConnection['invoke'],
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
}

const log = createLogger({ service: 'test', forceJson: true });

describe('SignalRConsumer manual rebuild', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rebuilds the connection after onclose fires', async () => {
    // Each call to build returns a fresh hub state. We track them so
    // the test can assert that `start()` was called once per hub.
    const hubs: FakeHub[] = [];
    const build: BuildConnection = () => {
      const s: FakeHub = {
        startCalls: 0,
        startReject: null,
        closeHandler: null,
        reconnectingHandler: null,
        reconnectedHandler: null,
        receiveTickHandler: null,
      };
      hubs.push(s);
      return makeHub(s);
    };

    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      buildConnection: build,
      log,
    });

    await consumer.start();
    expect(hubs).toHaveLength(1);
    expect(hubs[0]!.startCalls).toBe(1);

    // SDK exhausts auto-reconnect → fires onclose.
    hubs[0]!.closeHandler!(new Error('connection lost'));
    expect(consumer.isStarted()).toBe(false);

    // Advance past the first manual-rebuild backoff (≤ 2.5 s including jitter).
    await vi.advanceTimersByTimeAsync(3_000);

    // A fresh hub was built and started.
    expect(hubs.length).toBeGreaterThanOrEqual(2);
    expect(hubs.at(-1)!.startCalls).toBe(1);
    expect(consumer.isStarted()).toBe(true);

    await consumer.stop();
  });

  it('keeps retrying with backoff when rebuild fails', async () => {
    const hubs: FakeHub[] = [];
    let buildCount = 0;
    const build: BuildConnection = () => {
      buildCount += 1;
      const s: FakeHub = {
        startCalls: 0,
        // Reject on attempts 2 and 3, succeed on attempt 4.
        startReject: buildCount > 1 && buildCount < 4 ? new Error(`attempt ${buildCount}`) : null,
        closeHandler: null,
        reconnectingHandler: null,
        reconnectedHandler: null,
        receiveTickHandler: null,
      };
      hubs.push(s);
      return makeHub(s);
    };

    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      buildConnection: build,
      log,
    });

    await consumer.start();
    hubs[0]!.closeHandler!(new Error('lost'));

    // Backoffs are 2 s, 4 s, 8 s with ±25 % jitter. Advance generously.
    await vi.advanceTimersByTimeAsync(40_000);

    expect(consumer.isStarted()).toBe(true);
    // We saw at least 4 build attempts: initial + 3 rebuilds.
    expect(buildCount).toBeGreaterThanOrEqual(4);

    await consumer.stop();
  });

  it('does not schedule a rebuild when stop() has been called', async () => {
    const hubs: FakeHub[] = [];
    const build: BuildConnection = () => {
      const s: FakeHub = {
        startCalls: 0,
        startReject: null,
        closeHandler: null,
        reconnectingHandler: null,
        reconnectedHandler: null,
        receiveTickHandler: null,
      };
      hubs.push(s);
      return makeHub(s);
    };

    const consumer = new SignalRConsumer({
      hubUrl: 'https://biquote.io/hubs/tick',
      onTick: () => undefined,
      buildConnection: build,
      log,
    });

    await consumer.start();
    await consumer.stop();
    // Simulate a late-arriving onclose from the SDK after stop.
    hubs[0]!.closeHandler?.(new Error('post-stop'));
    await vi.advanceTimersByTimeAsync(60_000);

    // No additional builds happened.
    expect(hubs).toHaveLength(1);
  });
});
