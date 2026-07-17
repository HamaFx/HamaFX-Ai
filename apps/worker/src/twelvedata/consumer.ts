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

// Twelve Data WebSocket consumer — extends BaseWsConsumer for price streams.
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
import { BaseWsConsumer } from '../base-ws-consumer.js';
import type { NormalizedTick } from '../signalr/consumer.js';

const TD_WS_BASE = process.env.TWELVEDATA_WS_URL ?? 'wss://ws.twelvedata.com/v1';
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAX_SYMBOLS = 8; // Free tier limit

export interface TwelveDataWsConsumerOptions {
  apiKey: string;
  /** Twelve Data format symbols: "XAU/USD", "EUR/USD" */
  symbols: string[];
  onTick: (tick: NormalizedTick) => void;
  onActivity?: () => void;
  log: Logger;
}

export class TwelveDataWsConsumer extends BaseWsConsumer {
  private symbols: Set<string> = new Set();
  private readonly apiKey: string;
  private readonly onTick: (tick: NormalizedTick) => void;

  constructor(opts: TwelveDataWsConsumerOptions) {
    super(opts.log, opts.onActivity);
    this.apiKey = opts.apiKey;
    this.symbols = new Set(opts.symbols.slice(0, MAX_SYMBOLS));
    this.onTick = opts.onTick;
  }

  override async start(): Promise<void> {
    if (!this.apiKey) {
      this.log.warn('twelvedata ws skipped — no API key configured');
      return;
    }
    return super.start();
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

    if (this.isConnected()) {
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

  // ── BaseWsConsumer overrides ────────────────────────────────────────

  protected override buildUrl(): string {
    return `${TD_WS_BASE}?apikey=${this.apiKey}`;
  }

  protected override onOpen(): void {
    this.log.info('twelvedata ws connected');
    // Subscribe to current symbols
    if (this.symbols.size > 0) {
      this.send({
        action: 'subscribe',
        params: { symbols: [...this.symbols].join(',') },
      });
    }
  }

  protected override buildHeartbeatIntervalMs(): number {
    return HEARTBEAT_INTERVAL_MS;
  }

  protected override sendHeartbeat(): void {
    this.send({ action: 'heartbeat' });
  }

  protected override handleMessage(data: WebSocket.Data): void {

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
}
