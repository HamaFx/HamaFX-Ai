// BiQuote SignalR consumer. Holds a single persistent hub connection,
// subscribes to the three supported symbols, validates incoming ticks
// against the BiquoteTick schema, normalises them to LiveTick shape, and
// hands them to a caller-supplied `onTick` handler.
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

import { BiquoteTickSchema, isSymbol, SYMBOLS, type Symbol } from '@hamafx/shared';

import type { Logger } from '../log.js';
import { DEFAULT_RECONNECT_DELAYS } from './reconnect.js';

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
   * Handle one raw tick. Validates against BiquoteTickSchema, drops if the
   * symbol isn't one of our three, normalises to a LiveTick-shaped DTO,
   * and dispatches to `onTick`.
   *
   * Exposed for tests; SignalR itself drives this via `on('ReceiveTick', ...)`.
   */
  handleTick(raw: unknown): void {
    const parsed = BiquoteTickSchema.safeParse(raw);
    if (!parsed.success) {
      this.opts.log.warn('signalr tick rejected: invalid shape', {
        issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join('.')),
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

    const ts = Date.parse(tick.time);
    if (Number.isNaN(ts)) {
      this.opts.log.warn('signalr tick rejected: bad time', { time: tick.time });
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
