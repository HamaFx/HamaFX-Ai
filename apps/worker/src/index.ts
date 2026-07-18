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

// HamaFX-Ai worker entry point.
//
// Phase 8 PR-6: the worker now holds a persistent BiQuote SignalR
// connection. Ticks flow into `TickBuffer`, which is drained once per
// second and UPSERTed into `live_ticks`. The 1m candle aggregator (PR-7)
// will plug into the same tick stream alongside the buffer.
//
// Phase 9a: Binance WebSocket consumer for live crypto klines.
//
// Lifecycle:
//   1. loadEnv — fail fast if required env is missing.
//   2. createLogger — JSON in prod, pretty in dev.
//   3. installSignalHandlers — graceful shutdown on SIGTERM / SIGINT.
//   4. start SignalR consumer + Binance WS consumer + the 1Hz flush loop.
//   5. heartbeat to healthchecks.io every 30s while the consumer is alive.

import { closeDb, getDb } from '@hamafx/db';
import { initLangfuse, shutdownLangfuse } from '@hamafx/ai';

import { Candle1mAggregator, type ClosedCandle } from './aggregator/candle-1m.js';
import { createHealthServer } from './http-server.js';
import { loadEnv, type WorkerEnv } from './env.js';
import { ping } from './healthchecks.js';
import { createLogger, type Logger } from './log.js';
import { flushClosedCandle } from './persistence/candles-1m.js';
import { flushLiveTicks } from './persistence/live-ticks.js';
import {
  notifyReady,
  notifyStatus,
  notifyStopping,
  notifyWatchdog,
} from './sd-notify.js';
import { captureException, flushSentry, initSentry } from './sentry.js';
import { BinanceStreamConsumer } from './binance/index.js';
import {
  createDefaultBuildConnection,
  SignalRConsumer,
  type BuildConnection,
  type NormalizedTick,
} from './signalr/consumer.js';
import { TickBuffer } from './signalr/tick-buffer.js';
import { startMT5Server } from './mt5-server.js';
import { SymbolManager } from './symbol-manager.js';

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
      // M-1: Flush Sentry before hard-exiting so the crash report isn't lost.
      flushSentry(2_000).finally(() => process.exit(1));
      return;
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
  buildConnection?: BuildConnection;
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
  binanceConsumer: BinanceStreamConsumer;
  buffer: TickBuffer;
  aggregator: Candle1mAggregator;
  /** Returns the epoch ms of the last tick (0 if none received yet). */
  getLastTickAt(): number;
  /** Idempotent. Cleanly tears down timers + the hub. */
  stop(): Promise<void>;
}

export async function runWorker(args: RunWorkerArgs): Promise<RunningWorker> {
  const { env, log } = args;
  const buildConnection =
    args.buildConnection ?? (await createDefaultBuildConnection());
  const buffer = new TickBuffer();
  const db = getDb();

  const MT5_FALLBACK_TIMEOUT_MS = 5_000;

  let lastTickAt = 0;
  let lastMt5TickAt = 0;

  // Shared tick handler to push ticks to database buffer, trigger 1m candle aggregations, and notify watchdog
  // Priority: MT5 > BiQuote > Binance
  const handleIncomingTick = (tick: NormalizedTick) => {
    const now = Date.now();
    
    if (tick.source === 'mt5-local') {
      lastMt5TickAt = now;
    } else if (tick.source === 'biquote-signalr') {
      // Drop BiQuote ticks if MT5 is active
      if (now - lastMt5TickAt < MT5_FALLBACK_TIMEOUT_MS) return;
    }

    buffer.push(tick);
    aggregator.feed(tick);
    args.onTick?.(tick);
    lastTickAt = now;
    notifyWatchdog();
  };

  // 1m candle aggregator — emits ClosedCandle events on minute rollover.
  // We write each closed bar to `candles_1m` synchronously; failures are
  // logged but do NOT throw, because a single failed insert shouldn't
  // take down the consumer.
  //
  // OBS-08 (Phase 5.2): A *sustained* write failure should still page
  // someone. We rate-limit Sentry capture to at most 1 event per 5
  // minutes per failure source so a transient blip doesn't cause alert
  // fatigue.
  let lastCandleCaptureAt = 0;
  const CANDLE_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  let candleFailureCount = 0;

  const aggregator = new Candle1mAggregator((bar: ClosedCandle) => {
    void (async () => {
      try {
        await flushClosedCandle({ db, log, bar });
        log.info('candle closed', {
          symbol: bar.symbol,
          t: new Date(bar.t).toISOString(),
          o: bar.o,
          h: bar.h,
          l: bar.l,
          c: bar.c,
          ticks: bar.tickVolume,
        });
        // Reset failure counter on success
        candleFailureCount = 0;
      } catch (err) {
        candleFailureCount += 1;
        log.error('flushClosedCandle failed', { err: String(err), symbol: bar.symbol, consecutiveFailures: candleFailureCount });

        // Rate-limited Sentry capture: only page after sustained failures
        const now = Date.now();
        if (candleFailureCount >= 3 && now - lastCandleCaptureAt > CANDLE_CAPTURE_COOLDOWN_MS) {
          lastCandleCaptureAt = now;
          captureException(err, {
            kind: 'flushClosedCandle-sustained',
            symbol: bar.symbol,
            consecutiveFailures: String(candleFailureCount),
          });
        }
      }
    })();
  });

  const consumer = new SignalRConsumer({
    hubUrl: env.BIQUOTE_HUB_URL,
    onTick: handleIncomingTick,
    buildConnection,
    log: log.with({ module: 'signalr' }),
    // Default to empty; SymbolManager will immediately populate it
    symbols: [],
  });

  const symbolManager = new SymbolManager(log.with({ module: 'symbol-manager' }));
  
  // Wire per-consumer subscription updates
  symbolManager.on('symbolsChanged', ({ added, removed }) => {
    // Backward compat: still update BiQuote consumer via aggregate event
    if (consumer.isStarted()) {
      void consumer.updateSubscriptions(added, removed);
    }
  });
  symbolManager.on('biquoteChanged', ({ added, removed }) => {
    if (consumer.isStarted()) {
      void consumer.updateSubscriptions(added, removed);
    }
  });
  symbolManager.on('binanceChanged', ({ added, removed }) => {
    if (binanceConsumer) {
      void binanceConsumer.updateSubscriptions(added, removed);
    }
  });

  // Binance WebSocket consumer for live crypto klines.
  const cryptoSymbols = (env.BINANCE_CRYPTO_SYMBOLS ?? 'BTCUSDT,ETHUSDT')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const binanceConsumer = new BinanceStreamConsumer({
    symbols: cryptoSymbols,
    onTick: handleIncomingTick,
    onActivity: () => notifyWatchdog(),
    log: log.with({ module: 'binance-ws' }),
  });

  // Start the Headless MT5 TCP bridge server on the whitelisted local loopback port
  const mt5Server = startMT5Server({
    port: env.MT5_BRIDGE_PORT,
    log: log.with({ module: 'mt5-server' }),
    onTick: handleIncomingTick,
  });

  await consumer.start();        // BiQuote SignalR
  await binanceConsumer.start(); // Binance WS
  symbolManager.start();
  // The consumer is connected and subscribed — tell systemd we're done
  // bootstrapping. Pair with `Type=notify` in hamafx-worker.service so
  // the unit only enters `active (running)` once we're ready.
  notifyReady();
  notifyStatus('signalr + binance ws connected; tick stream active');

  // OBS-08 (Phase 5.2): Rate-limited Sentry capture for sustained
  // flushLiveTicks failures. Same cooldown pattern as candle flush:
  // at most 1 Sentry event per 5 minutes after 3 consecutive failures.
  let lastTickFlushCaptureAt = 0;
  let tickFlushFailureCount = 0;
  const TICK_FLUSH_CAPTURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  const flushIntervalMs = args.flushIntervalMs ?? 1_000;
  const flushTimer = setInterval(() => {
    void (async () => {
      try {
        const r = await flushLiveTicks({ db, buffer, log });
        if (r.written > 0) {
          log.info('flushed live_ticks', { written: r.written, ticks: r.totalTicks });
        }
        tickFlushFailureCount = 0;
      } catch (err) {
        tickFlushFailureCount += 1;
        log.error('flushLiveTicks failed', { err: String(err), consecutiveFailures: tickFlushFailureCount });

        const now = Date.now();
        if (tickFlushFailureCount >= 3 && now - lastTickFlushCaptureAt > TICK_FLUSH_CAPTURE_COOLDOWN_MS) {
          lastTickFlushCaptureAt = now;
          captureException(err, {
            kind: 'flushLiveTicks-sustained',
            consecutiveFailures: String(tickFlushFailureCount),
          });
        }
      }
    })();
  }, flushIntervalMs);
  flushTimer.unref();

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
    heartbeatTimer.unref();
  }

  const stop = async (): Promise<void> => {
    notifyStopping();
    clearInterval(flushTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    symbolManager.stop();
    
    // Gracefully shut down all services in parallel
    await Promise.all([
      mt5Server.stop(),
      consumer.stop(),
      binanceConsumer.stop(),
    ]);

    // Drain anything buffered after the last interval tick — best-effort.
    try {
      await flushLiveTicks({ db, buffer, log });
    } catch (err) {
      log.warn('final flush on stop failed', { err: String(err) });
    }
    // Force-close the open 1m bar so we don't lose the partial bar at the
    // edge. Idempotent if the aggregator is already empty.
    aggregator.closeAll();
  };

  const getLastTickAt = (): number => lastTickAt;

  return { consumer, binanceConsumer, buffer, aggregator, getLastTickAt, stop };
}

import { startScheduler } from './scheduler.js';

export async function main(): Promise<void> {
  // Phase 3 §3.9 — load secrets from vault (GCP Secret Manager) before
  // loadEnv() runs. No-op when SECRETS_VAULT_PROVIDER is unset or 'none'.
  const { loadSecretsFromVault } = await import('@hamafx/shared/vault');
  await loadSecretsFromVault();

  const env = loadEnv();
  const log = createLogger({ service: 'worker', commit: env.DEPLOYED_SHA });

  await initSentry(env, 'worker');

  // ── Langfuse LLM Observability ──────────────────────────────────────
  // Silently skipped when LANGFUSE_* env vars are not set.
  initLangfuse();

  log.info('worker starting', {
    nodeVersion: process.version,
    biquoteHubUrl: env.BIQUOTE_HUB_URL,
    healthchecksConfigured: Boolean(env.HC_SIGNALR_UUID),
    sentryConfigured: Boolean(env.SENTRY_DSN),
    workerMode: env.WORKER_MODE,
  });

  if (env.WORKER_MODE === 'docker') {
    startScheduler(log);
  }

  // Send unhandled rejections / uncaught exceptions to Sentry before the
  // process dies. Node's default is to crash; we want the report first.
  process.on('unhandledRejection', (reason) => {
    log.error('unhandledRejection', { reason: String(reason) });
    captureException(reason, { kind: 'unhandledRejection' });
  });
  // Node.js documentation warns: attempting to resume after an uncaught
  // exception can lead to undefined behavior. We flush Sentry then exit —
  // systemd will restart the worker automatically.
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { err: String(err) });
    captureException(err, { kind: 'uncaughtException' });
    flushSentry(2_000).finally(() => process.exit(1));
  });

  installSignalHandlers(log);

  const worker = await runWorker({ env, log });

  // ── HTTP server: health checks + BiQuote REST proxy ──────────────────
  const healthServer = createHealthServer({
    log,
    getLastTickAt: worker.getLastTickAt,
    isSignalRConnected: () => worker.consumer.isStarted(),
  });

  healthServer.listen(8081, '127.0.0.1', () => {
    log.info('Health server listening on 127.0.0.1:8081');
  });

  onShutdown(() => closeDb());
  onShutdown(() => {
    healthServer.close();
    return worker.stop();
  });
  onShutdown(() => flushSentry(2_000));
  onShutdown(() => shutdownLangfuse());

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
    const msg = JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      msg: 'worker bootstrap failed',
      err: String(err),
    });
    // Use process.stderr so the structured JSON error goes to stderr
    // where the systemd journal / container runtime can capture it.
    process.stderr.write(msg + '\n');
    process.exit(1);
  });
}
