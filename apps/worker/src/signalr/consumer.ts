// BiQuote SignalR consumer. Holds a single persistent hub connection,
// subscribes to the three supported symbols, validates incoming ticks
// against the BiquoteSignalRTick schema, normalises them to LiveTick
// shape, and hands them to a caller-supplied `onTick` handler.
//
// The hub client itself is injected via the `buildConnection` factory so
// tests can stub `@microsoft/signalr` without monkey-patching modules. In
// production we pass in the real `HubConnectionBuilder` from the package.
//
// Reference: https://biquote.io/docs#websocket
//
// SignalR events we care about:
//   - "ReceiveTick" (server → client)         — every BiQuote tick
//   - "Subscribe(symbols[])" (client → server) — subscribe call
//   - "Unsubscribe(symbols[])"                  — symmetric unsubscribe
//
// Phase 8 PR-6 — feeds `live_ticks` (this PR). PR-7 wires the same `onTick`
// to the in-process 1m candle aggregator.

import {
  BiquoteSignalRTickSchema,
  isSymbol,
  SYMBOLS,
  type Symbol,
} from '@hamafx/shared';

import type { Logger } from '../log.js';
import { DEFAULT_RECONNECT_DELAYS, jitteredDelay } from './reconnect.js';

export interface NormalizedTick {
  symbol: Symbol;
  bid: number;
  ask: number;
  /** mid = (bid + ask) / 2 — pre-computed so consumers don't recompute. */
  mid: number;
  /** ms epoch UTC. */
  ts: number;
  /** Stable string. 'biquote-signalr' from this consumer. */
  source: 'biquote-signalr';
}

export interface MinimalHubConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke(method: string, ...args: unknown[]): Promise<unknown>;
  on(method: string, handler: (...args: unknown[]) => void): void;
  off(method: string, handler?: (...args: unknown[]) => void): void;
  onreconnecting(handler: (err?: unknown) => void): void;
  onreconnected(handler: (id?: string) => void): void;
  onclose(handler: (err?: unknown) => void): void;
}

export interface BuildConnectionArgs {
  hubUrl: string;
  reconnectDelaysMs?: number[];
}

export type BuildConnection = (args: BuildConnectionArgs) => MinimalHubConnection;

export interface ConsumerOptions {
  hubUrl: string;
  /** Symbols to subscribe to. Defaults to all SUPPORTED_SYMBOLS. */
  symbols?: Symbol[];
  /** Called for every validated tick. Errors thrown here are logged + swallowed. */
  onTick: (tick: NormalizedTick) => void;
  /** Optional liveness signal — fires when a tick arrives (for healthchecks). */
  onActivity?: () => void;
  /** Override the SignalR connection factory (used by tests). */
  buildConnection: BuildConnection;
  log: Logger;
  reconnectDelaysMs?: number[];
}

export class SignalRConsumer {
  private readonly opts: ConsumerOptions;
  private connection: MinimalHubConnection | null = null;
  /** Symbols we've asked the hub to subscribe to; resent on reconnect. */
  private subscribedSymbols: Symbol[] = [];
  /** True after `start()` resolves and until `stop()` runs. */
  private started = false;
  /**
   * Phase 2 hardening §1 — manual reconnect state. Once SignalR's own
   * automatic reconnect schedule is exhausted, the SDK fires `onclose`
   * and stops trying. Without this loop the worker process keeps
   * running with no SignalR connection and tick ingestion is silently
   * dead until the next deploy or manual restart.
   */
  private stopping = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  /** Cap the manual rebuild backoff so we never sleep more than a minute. */
  private static readonly MAX_REBUILD_BACKOFF_MS = 60_000;

  constructor(opts: ConsumerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const symbols = this.opts.symbols ?? [...SYMBOLS];
    this.subscribedSymbols = symbols;

    const conn = this.opts.buildConnection({
      hubUrl: this.opts.hubUrl,
      reconnectDelaysMs: this.opts.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS,
    });
    this.connection = conn;

    conn.on('ReceiveTick', (...args: unknown[]) => {
      this.handleTick(args[0]);
    });

    conn.onreconnecting((err) => {
      this.opts.log.warn('signalr reconnecting', { err: err ? String(err) : undefined });
    });
    conn.onreconnected(() => {
      this.opts.log.info('signalr reconnected — resubscribing', {
        symbols: this.subscribedSymbols,
      });
      void this.subscribe(this.subscribedSymbols);
    });
    conn.onclose((err) => {
      this.opts.log.error('signalr connection closed', {
        err: err ? String(err) : 'no error',
      });
      this.started = false;
      // Phase 2 hardening §1 — schedule a manual rebuild instead of
      // letting the worker silently sit with no connection.
      if (!this.stopping) this.scheduleReconnect();
    });

    this.opts.log.info('signalr starting', {
      hubUrl: this.opts.hubUrl,
      symbols,
    });
    await conn.start();
    await this.subscribe(symbols);
    this.started = true;
    this.opts.log.info('signalr subscribed', { symbols });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.connection) return;
    try {
      await this.unsubscribe(this.subscribedSymbols);
    } catch (err) {
      this.opts.log.warn('signalr unsubscribe failed during stop', { err: String(err) });
    }
    try {
      await this.connection.stop();
    } catch (err) {
      this.opts.log.warn('signalr stop failed', { err: String(err) });
    }
    this.connection = null;
    this.started = false;
  }

  /**
   * Manual rebuild loop. Triggered when the SignalR SDK's own
   * `withAutomaticReconnect` schedule has been exhausted (it stops
   * trying after the array runs out). We cap the backoff at 60 s and
   * use jitter so workers restarting in lockstep don't synchronise
   * their reconnect attempts.
   */
  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const baseMs = Math.min(
      SignalRConsumer.MAX_REBUILD_BACKOFF_MS,
      2_000 * Math.pow(2, this.reconnectAttempt - 1),
    );
    const delay = jitteredDelay(baseMs);
    this.opts.log.warn('signalr scheduling manual rebuild', {
      attempt: this.reconnectAttempt,
      delayMs: Math.round(delay),
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.rebuild();
    }, delay);
  }

  private async rebuild(): Promise<void> {
    if (this.stopping) return;
    // The previous connection is dead — drop the reference so `start()`
    // builds a fresh one. `started` is already false from `onclose`.
    this.connection = null;
    try {
      await this.start();
      this.opts.log.info('signalr manual rebuild succeeded', {
        attempts: this.reconnectAttempt,
      });
      this.reconnectAttempt = 0;
    } catch (err) {
      this.opts.log.error('signalr manual rebuild failed', { err: String(err) });
      this.scheduleReconnect();
    }
  }

  /** Public for tests; production code calls it via start()/onreconnected. */
  async subscribe(symbols: Symbol[]): Promise<void> {
    if (!this.connection || symbols.length === 0) return;
    await this.connection.invoke('Subscribe', symbols);
  }

  async unsubscribe(symbols: Symbol[]): Promise<void> {
    if (!this.connection || symbols.length === 0) return;
    await this.connection.invoke('Unsubscribe', symbols);
  }

  /**
   * Handle one raw tick. Validates against BiquoteSignalRTickSchema,
   * drops if the symbol isn't one of our three, normalises to a
   * LiveTick-shaped DTO, and dispatches to `onTick`.
   *
   * Exposed for tests; SignalR itself drives this via `on('ReceiveTick', ...)`.
   */
  handleTick(raw: unknown): void {
    const parsed = BiquoteSignalRTickSchema.safeParse(raw);
    if (!parsed.success) {
      // Log the raw payload's keys (NOT values — they may contain bid/ask
      // info we'd rather not splatter). The first time we see a new shape
      // this catches it.
      const keys =
        raw !== null && typeof raw === 'object' ? Object.keys(raw as Record<string, unknown>) : [];
      this.opts.log.warn('signalr tick rejected: invalid shape', {
        issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join('.')),
        observedKeys: keys.slice(0, 12),
      });
      return;
    }

    const tick = parsed.data;
    if (!isSymbol(tick.symbol)) {
      // BiQuote pushes ticks for all subscribed symbols; in theory we never
      // see ticks for symbols we didn't subscribe to, but skip silently
      // if a stray tick arrives (e.g. mid-resubscribe race).
      return;
    }

    const ts = parseTickTimestamp(tick.timestamp);
    if (ts === null) {
      this.opts.log.warn('signalr tick rejected: bad timestamp', {
        timestamp: String(tick.timestamp).slice(0, 60),
      });
      return;
    }

    const mid = (tick.bid + tick.ask) / 2;
    const normalized: NormalizedTick = {
      symbol: tick.symbol,
      bid: tick.bid,
      ask: tick.ask,
      mid,
      ts,
      source: 'biquote-signalr',
    };

    try {
      this.opts.onTick(normalized);
      this.opts.onActivity?.();
    } catch (err) {
      this.opts.log.error('onTick handler threw', { err: String(err) });
    }
  }

  /** Test introspection. */
  isStarted(): boolean {
    return this.started;
  }
}

/**
 * Parse a SignalR tick's `timestamp` field. Accepts:
 *   - number: ms epoch UTC, returned as-is.
 *   - string: ISO-8601 UTC; runs through `Date.parse` and returns ms epoch.
 * Returns null on un-parseable input.
 */
function parseTickTimestamp(input: number | string): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return null;
    // Heuristic: if the number is small (< 1e12), assume seconds and
    // promote to ms. BiQuote pushes ms, but defending against any future
    // server-side format change is cheap.
    return input < 1_000_000_000_000 ? input * 1000 : input;
  }
  const t = Date.parse(input);
  return Number.isNaN(t) ? null : t;
}

/**
 * Production factory: builds a real SignalR HubConnection. Imported lazily
 * via `await import('@microsoft/signalr')` so unit tests don't need the
 * package installed and so the worker startup doesn't pay the cost on the
 * hot path.
 */
export async function createDefaultBuildConnection(): Promise<BuildConnection> {
  const mod = await import('@microsoft/signalr');
  const { HubConnectionBuilder } = mod;

  return ({ hubUrl, reconnectDelaysMs }) => {
    const conn = new HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect(reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS)
      .build();
    return conn as unknown as MinimalHubConnection;
  };
}
