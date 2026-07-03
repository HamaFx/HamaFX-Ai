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

// Twelve Data WebSocket consumer.
// Connects to wss://ws.twelvedata.com/v1?apikey=KEY
// Subscribes to up to 8 symbols (free tier limit).
// Receives price events and normalizes to NormalizedTick.
//
// Protocol:
//   - Subscribe:   {"action": "subscribe", "params": {"symbols": "XAU/USD,EUR/USD"}}
//   - Price event: {"event": "price", "symbol": "EUR/USD", "price": "1.08542", "timestamp": 1631772000}
//   - Unsubscribe: {"action": "unsubscribe", "params": {"symbols": "EUR/USD"}}
//   - Heartbeat:   {"action": "heartbeat"} every 10 seconds
//   - Reconnect:   server sends {"event": "reconnect"} — client must reconnect within 5s

import WebSocket from 'ws';
import { twelvedata as tdProvider } from '@hamafx/data';
import type { Logger } from '../log.js';
import type { NormalizedTick } from '../signalr/consumer.js';

const TD_WS_BASE = process.env.TWELVEDATA_WS_URL ?? 'wss://ws.twelvedata.com/v1';
const HEARTBEAT_INTERVAL_MS = 10_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
const MAX_SYMBOLS = 8; // Free tier limit

export interface TwelveDataWsConsumerOptions {
  apiKey: string;
  /** Twelve Data format symbols: "XAU/USD", "EUR/USD" */
  symbols: string[];
  onTick: (tick: NormalizedTick) => void;
  onActivity?: () => void;
  log: Logger;
}

export class TwelveDataWsConsumer {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly symbols: Set<string> = new Set();
  private readonly apiKey: string;
  private readonly onTick: (tick: NormalizedTick) => void;
  private readonly onActivity: (() => void) | undefined;
  private readonly log: Logger;

  constructor(opts: TwelveDataWsConsumerOptions) {
    this.apiKey = opts.apiKey;
    this.symbols = new Set(opts.symbols.slice(0, MAX_SYMBOLS));
    this.onTick = opts.onTick;
    this.onActivity = opts.onActivity;
    this.log = opts.log;
  }

  async start(): Promise<void> {
    if (this.destroyed) return;
    if (!this.apiKey) {
      this.log.warn('twelvedata ws skipped — no API key configured');
      return;
    }
    this.connect();
  }

  async stop(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.ws) {
      this.ws.on('open', () => {});
      this.ws.on('message', () => {});
      this.ws.on('error', () => {});
      this.ws.on('close', () => {});
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Update subscriptions dynamically.
   * Respects the 8-symbol free-tier limit.
   */
  async updateSubscriptions(symbols: string[]): Promise<void> {
    const newSymbols = new Set(symbols.slice(0, MAX_SYMBOLS));
    const toAdd = [...newSymbols].filter((s) => !this.symbols.has(s));
    const toRemove = [...this.symbols].filter((s) => !newSymbols.has(s));

    this.symbols.clear();
    for (const s of newSymbols) this.symbols.add(s);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (toRemove.length > 0) {
        this.send({ action: 'unsubscribe', params: { symbols: toRemove.join(',') } });
      }
      if (toAdd.length > 0) {
        this.send({ action: 'subscribe', params: { symbols: toAdd.join(',') } });
      }
    }

    this.log.info('twelvedata ws subscriptions updated', {
      total: this.symbols.size,
      added: toAdd.length,
      removed: toRemove.length,
    });
  }

  private connect(): void {
    if (this.destroyed) return;

    const url = `${TD_WS_BASE}?apikey=${this.apiKey}`;
    this.log.info('twelvedata ws connecting', { url: url.slice(0, 60) + '...' });

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.log.error('twelvedata ws creation failed', { err: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.log.info('twelvedata ws connected');
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      // Subscribe to current symbols
      if (this.symbols.size > 0) {
        this.send({
          action: 'subscribe',
          params: { symbols: [...this.symbols].join(',') },
        });
      }
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.onActivity?.();
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      this.log.warn('twelvedata ws error', { err: String(err) });
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.log.warn('twelvedata ws closed', { code, reason: reason.toString() });
      this.stopHeartbeat();
      if (!this.destroyed) this.scheduleReconnect();
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg || typeof msg !== 'object') return;

      // Handle reconnect event from server
      if (msg.event === 'reconnect') {
        this.log.info('twelvedata ws server requested reconnect');
        this.stopHeartbeat();
        if (this.ws) {
          this.ws.close(4000, 'server reconnect request');
        }
        return;
      }

      // Handle price event
      if (msg.event === 'price' && msg.symbol && msg.price) {
        const tick: NormalizedTick = {
          symbol: this.tdToInternal(msg.symbol),
          bid: Number(msg.price),
          ask: Number(msg.price),
          mid: Number(msg.price),
          // Twelve Data sends timestamp in seconds, convert to ms
          ts: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
          source: 'twelvedata-ws',
        };
        this.onTick(tick);
      }
    } catch (err) {
      this.log.warn('twelvedata ws parse error', { err: String(err) });
    }
  }

  /**
   * Map Twelve Data symbol format to internal format.
   * "XAU/USD" → "XAUUSD", "EUR/USD" → "EURUSD"
   */
  private tdToInternal(tdSymbol: string): string {
    return tdProvider.fromTwelveDataSymbol(tdSymbol);
  }

  private send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ action: 'heartbeat' });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]!;
    this.reconnectAttempt += 1;
    this.log.info('twelvedata ws reconnect in', { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
