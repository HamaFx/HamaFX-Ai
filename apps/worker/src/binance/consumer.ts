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

// Binance WebSocket consumer — extends BaseWsConsumer for kline streams.

import WebSocket from 'ws';
import type { Logger } from '../log.js';
import { BaseWsConsumer } from '../base-ws-consumer.js';
import type { NormalizedTick } from '../signalr/consumer.js';

const BINANCE_WS_BASE = process.env.BINANCE_WS_URL ?? 'wss://stream.binance.com:9443';
const PING_INTERVAL_MS = 3 * 60 * 1_000;
const MAX_EMPTY_MINUTES = 10;

export interface BinanceStreamConsumerOptions {
  symbols: string[];
  onTick: (tick: NormalizedTick) => void;
  onActivity?: () => void;
  log: Logger;
}

export class BinanceStreamConsumer extends BaseWsConsumer {
  private lastMessageAt = 0;
  private symbols: string[];
  private readonly onTick: (tick: NormalizedTick) => void;

  constructor(opts: BinanceStreamConsumerOptions) {
    super(opts.log, opts.onActivity);
    this.symbols = opts.symbols;
    this.onTick = opts.onTick;
  }

  /** Update subscriptions dynamically. Reconnects with the new symbol set. */
  async updateSubscriptions(added: string[], removed: string[]): Promise<void> {
    const newSet = new Set(this.symbols);
    for (const s of added) newSet.add(s);
    for (const s of removed) newSet.delete(s);

    this.symbols.length = 0;
    this.symbols.push(...newSet);

    // Reconnect with updated streams
    if (this.ws && !this.destroyed) {
      this.ws.close(4000, 'subscription update');
    }
  }

  // ── BaseWsConsumer overrides ────────────────────────────────────────

  protected override buildUrl(): string {
    if (this.symbols.length === 0) {
      this.log.info('binance ws skipping — no symbols configured');
      return '';
    }
    const streams = this.symbols
      .map((s) => `${s.toLowerCase()}@kline_1m`)
      .join('/');
    return `${BINANCE_WS_BASE}/stream?streams=${streams}`;
  }

  protected override onOpen(): void {
    this.log.info('binance ws connected');
    this.lastMessageAt = Date.now();
  }

  protected override buildHeartbeatIntervalMs(): number {
    return PING_INTERVAL_MS;
  }

  protected override sendHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
    }
    const idleSec = (Date.now() - this.lastMessageAt) / 1_000;
    if (idleSec > MAX_EMPTY_MINUTES * 60 && this.ws) {
      this.log.warn('binance ws idle — reconnecting', { idleSec });
      this.ws.close(4000, 'idle timeout');
    }
  }

  protected override handleMessage(data: WebSocket.Data): void {
    this.lastMessageAt = Date.now();

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
}
