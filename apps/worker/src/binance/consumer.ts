import WebSocket from 'ws';
import type { Logger } from '../log.js';
import type { NormalizedTick } from '../signalr/consumer.js';

const BINANCE_WS_BASE = process.env.BINANCE_WS_URL ?? 'wss://stream.binance.com:9443';
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const PING_INTERVAL_MS = 3 * 60 * 1_000;
const MAX_EMPTY_MINUTES = 10;

export interface BinanceStreamConsumerOptions {
  symbols: string[];
  onTick: (tick: NormalizedTick) => void;
  onActivity?: () => void;
  log: Logger;
}

export class BinanceStreamConsumer {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private readonly symbols: string[];
  private readonly onTick: (tick: NormalizedTick) => void;
  private readonly onActivity: (() => void) | undefined;
  private readonly log: Logger;

  constructor(opts: BinanceStreamConsumerOptions) {
    this.symbols = opts.symbols;
    this.onTick = opts.onTick;
    this.onActivity = opts.onActivity;
    this.log = opts.log;
  }

  async start(): Promise<void> {
    if (this.destroyed) return;
    this.connect();
  }

  async stop(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      this.ws.on('open', () => {});
      this.ws.on('message', () => {});
      this.ws.on('error', () => {});
      this.ws.on('close', () => {});
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.destroyed) return;

    const streams = this.symbols
      .map((s) => `${s.toLowerCase()}@kline_1m`)
      .join('/');
    const url = streams
      ? `${BINANCE_WS_BASE}/stream?streams=${streams}`
      : `${BINANCE_WS_BASE}/ws/!miniTicker@arr`;

    this.log.info('binance ws connecting', { url: url.slice(0, 80) });

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.log.error('binance ws creation failed', { err: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.log.info('binance ws connected');
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.startPing();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.lastMessageAt = Date.now();
      this.onActivity?.();
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      this.log.warn('binance ws error', { err: String(err) });
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.log.warn('binance ws closed', { code, reason: reason.toString() });
      this.stopPing();
      if (!this.destroyed) this.scheduleReconnect();
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg || !msg.data) return;

      const k = msg.data;
      if (k.e !== 'kline' || !k.k) return;

      const candle = k.k;
      const symbol = k.s;

      const tick: NormalizedTick = {
        symbol,
        bid: Number.parseFloat(candle.c),
        ask: Number.parseFloat(candle.c),
        mid: Number.parseFloat(candle.c),
        ts: candle.T,
        source: 'binance-ws',
      };

      this.onTick(tick);
    } catch (err) {
      this.log.warn('binance ws parse error', { err: String(err) });
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]!;
    this.reconnectAttempt += 1;
    this.log.info('binance ws reconnect in', { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
      const idleSec = (Date.now() - this.lastMessageAt) / 1_000;
      if (idleSec > MAX_EMPTY_MINUTES * 60 && this.ws) {
        this.log.warn('binance ws idle — reconnecting', { idleSec });
        this.ws.close(4000, 'idle timeout');
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
