// HamaFX-Ai worker entry point.
//
// Phase 8 PR-5 ships an *empty* worker: it loads env, initialises the
// logger, registers signal handlers, and idles so systemd has a
// `Type=notify` process to babysit. The SignalR consumer (PR-6),
// 1m candle aggregator (PR-7), and heavy-job runner (PR-9..14) plug
// into this same bootstrap as they land.
//
// Lifecycle:
//   1. loadEnv — fail fast if required env is missing.
//   2. createLogger — JSON in prod, pretty in dev.
//   3. installSignalHandlers — graceful shutdown on SIGTERM/SIGINT.
//   4. idle — `setInterval` keeps the event loop alive so the process
//      doesn't exit. PR-6 replaces this with the SignalR connection.

import { loadEnv } from './env.js';
import { createLogger, type Logger } from './log.js';

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

/**
 * Register a cleanup callback to run on graceful shutdown. Future PRs use
 * this to disconnect the SignalR hub, flush in-memory tick buffers, etc.
 */
export function onShutdown(fn: () => Promise<void> | void): void {
  state.cleanups.push(fn);
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

  // Phase 8 PR-5 keep-alive. PR-6 replaces this with the SignalR
  // consumer's `connection.start()` which keeps the event loop occupied
  // for as long as the hub is connected.
  const idle = setInterval(() => {
    /* no-op heartbeat to keep the event loop alive */
  }, 30_000);

  onShutdown(() => clearInterval(idle));

  log.info('worker idle — waiting for SignalR consumer (PR-6)');
}

// Only run main() when invoked as the entrypoint, not when imported by
// tests. The check works under both ESM and CommonJS resolution paths.
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
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'worker bootstrap failed', err: String(err) }));
    process.exit(1);
  });
}
