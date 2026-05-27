// HamaFX-Ai worker entry point.
//
// Phase 8 PR-6: the worker now holds a persistent BiQuote SignalR
// connection. Ticks flow into `TickBuffer`, which is drained once per
// second and UPSERTed into `live_ticks`. The 1m candle aggregator (PR-7)
// will plug into the same tick stream alongside the buffer.
//
// Lifecycle:
//   1. loadEnv — fail fast if required env is missing.
//   2. createLogger — JSON in prod, pretty in dev.
//   3. installSignalHandlers — graceful shutdown on SIGTERM / SIGINT.
//   4. start SignalR consumer + the 1Hz flush loop.
//   5. heartbeat to healthchecks.io every 30s while the consumer is alive.

import { getDb } from '@hamafx/db';

import { loadEnv, type WorkerEnv } from './env.js';
import { ping } from './healthchecks.js';
import { createLogger, type Logger } from './log.js';
import { flushLiveTicks } from './persistence/live-ticks.js';
import {
  createDefaultBuildConnection,
  SignalRConsumer,
  type NormalizedTick,
} from './signalr/consumer.js';
import { TickBuffer } from './signalr/tick-buffer.js';

interface ShutdownState {
  shuttingDown: boolean;
  /** Cleanup callbacks run in reverse-registration order on shutdown. */
  cleanups: Array<() => Promise<void> | void>;
}

const state: ShutdownState = { shuttingDown: false, cleanups: [] };

function installSignalHandlers(log: Logger): void {
  const handle = (signal: NodeJS.Signals): void => {
    if (state.shuttingDown) {
      log.warn('second signal received — exiting immediately', { signal });
      process.exit(1);
    }
    state.shuttingDown = true;
    log.info('shutdown signal received', { signal });

    void (async () => {
      // Run cleanups in reverse order so dependencies tear down first.
      for (let i = state.cleanups.length - 1; i >= 0; i -= 1) {
        try {
          await state.cleanups[i]?.();
        } catch (err) {
          log.error('cleanup failed', { err: String(err) });
        }
      }
      log.info('shutdown complete');
      process.exit(0);
    })();
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}

/** Register a cleanup callback to run on graceful shutdown. */
export function onShutdown(fn: () => Promise<void> | void): void {
  state.cleanups.push(fn);
}

/**
 * Compose the SignalR consumer + tick buffer + flush loop. Exported for
 * tests so they can drive the same wiring with a stubbed connection.
 */
export interface RunWorkerArgs {
  env: WorkerEnv;
  log: Logger;
  /** Override the SignalR factory (tests pass a fake builder). */
  buildConnection?: import('./signalr/consumer.js').BuildConnection;
  /** Override the flush loop interval (tests use a tiny number). */
  flushIntervalMs?: number;
  /** Override the heartbeat interval (tests use a tiny number or 0 to disable). */
  heartbeatIntervalMs?: number;
  /**
   * Tap that fires on every validated tick — used by PR-7 to feed the
   * candle aggregator without re-walking BiquoteTickSchema.
   */
  onTick?: (tick: NormalizedTick) => void;
}

export interface RunningWorker {
  consumer: SignalRConsumer;
  buffer: TickBuffer;
  /** Idempotent. Cleanly tears down timers + the hub. */
  stop(): Promise<void>;
}

export async function runWorker(args: RunWorkerArgs): Promise<RunningWorker> {
  const { env, log } = args;
  const buildConnection =
    args.buildConnection ?? (await createDefaultBuildConnection());
  const buffer = new TickBuffer();
  const db = getDb();

  let lastTickAt = 0;

  const consumer = new SignalRConsumer({
    hubUrl: env.BIQUOTE_HUB_URL,
    onTick: (tick) => {
      buffer.push(tick);
      args.onTick?.(tick);
      lastTickAt = Date.now();
    },
    buildConnection,
    log: log.with({ module: 'signalr' }),
  });

  await consumer.start();

  const flushIntervalMs = args.flushIntervalMs ?? 1_000;
  const flushTimer = setInterval(() => {
    void (async () => {
      try {
        const r = await flushLiveTicks({ db, buffer, log });
        if (r.written > 0) {
          log.info('flushed live_ticks', { written: r.written, ticks: r.totalTicks });
        }
      } catch (err) {
        log.error('flushLiveTicks failed', { err: String(err) });
      }
    })();
  }, flushIntervalMs);

  // Healthchecks heartbeat — only fires if we've actually seen a tick in
  // the last 60s. A silent connection is treated as a failure so
  // healthchecks.io alerts.
  const heartbeatIntervalMs = args.heartbeatIntervalMs ?? 30_000;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  if (heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      const ageMs = Date.now() - lastTickAt;
      if (lastTickAt > 0 && ageMs < 60_000) {
        void ping(env.HC_SIGNALR_UUID, 'success', `last_tick=${ageMs}ms`);
      } else {
        void ping(env.HC_SIGNALR_UUID, 'fail', `no_ticks_for=${Math.floor(ageMs / 1000)}s`);
      }
    }, heartbeatIntervalMs);
  }

  const stop = async (): Promise<void> => {
    clearInterval(flushTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await consumer.stop();
    // Drain anything buffered after the last interval tick — best-effort.
    try {
      await flushLiveTicks({ db, buffer, log });
    } catch (err) {
      log.warn('final flush on stop failed', { err: String(err) });
    }
  };

  return { consumer, buffer, stop };
}

export async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger({ service: 'worker', commit: env.DEPLOYED_SHA });

  log.info('worker starting', {
    nodeVersion: process.version,
    biquoteHubUrl: env.BIQUOTE_HUB_URL,
    healthchecksConfigured: Boolean(env.HC_SIGNALR_UUID),
  });

  installSignalHandlers(log);

  const worker = await runWorker({ env, log });
  onShutdown(() => worker.stop());

  log.info('worker running — feeding live_ticks from BiQuote SignalR');
}

// Only run main() when invoked as the entrypoint, not when imported by tests.
const isEntryPoint = (() => {
  try {
    const moduleUrl = new URL(import.meta.url).pathname;
    const argv1 = process.argv[1];
    return Boolean(argv1) && (moduleUrl === argv1 || moduleUrl.endsWith(argv1!));
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'worker bootstrap failed',
        err: String(err),
      }),
    );
    process.exit(1);
  });
}
