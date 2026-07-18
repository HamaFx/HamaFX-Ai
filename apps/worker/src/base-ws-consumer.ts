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

// Base WebSocket consumer — shared lifecycle for raw WS connections.
//
// BinanceStreamConsumer manages a WebSocket pattern: connect, reconnect
// with exponential backoff,
// heartbeat/ping timers, destroyed-flag guards, and event listener
// cleanup on stop. This base class extracts those patterns so new
// WS providers need only implement `buildUrl()`, `handleMessage()`,
// `onOpen()`, and `buildHeartbeatIntervalMs()`.
//
// SignalRConsumer is deliberately NOT part of this hierarchy — it uses
// the SignalR SDK's HubConnection which has a different lifecycle
// (start/stop/reconnect callbacks vs raw WebSocket events).

import WebSocket from 'ws';
import type { Logger } from './log.js';

/** Default reconnect delays: 1s, 2s, 5s, 10s, 30s, then capped. */
const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export abstract class BaseWsConsumer {
  protected ws: WebSocket | null = null;
  protected destroyed = false;
  protected reconnectAttempt = 0;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly log: Logger;
  /** Optional liveness signal — fired automatically when a message arrives. */
  protected readonly onActivity: (() => void) | undefined;

  constructor(log: Logger, onActivity?: () => void) {
    this.log = log;
    this.onActivity = onActivity;
  }

  // ── Abstract methods — subclasses must implement ────────────────────

  /** Build the WebSocket URL for the initial connection. */
  protected abstract buildUrl(): string;

  /** Handle a parsed message from the WebSocket. */
  protected abstract handleMessage(data: WebSocket.Data): void;

  /** Called after the WebSocket connects (subscribe, etc.). */
  protected abstract onOpen(): void;

  /** Heartbeat interval in ms. Return 0 to disable. */
  protected abstract buildHeartbeatIntervalMs(): number;

  // ── Lifecycle ───────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.destroyed) return;
    this.connect();
  }

  async stop(): Promise<void> {
    this.destroyed = true;
    this.clearTimers();
    if (this.ws) {
      // Null out all listeners so no reconnect fires after stop.
      this.ws.on('open', () => {});
      this.ws.on('message', () => {});
      this.ws.on('error', () => {});
      this.ws.on('close', () => {});
      this.ws.close();
      this.ws = null;
    }
  }

  // ── Connection management ───────────────────────────────────────────

  protected connect(): void {
    if (this.destroyed) return;

    const url = this.buildUrl();
    if (!url) {
      this.log.info(this.constructor.name + ' skipping — no URL to connect to');
      return;
    }

    this.log.info(this.constructor.name + ' connecting', { url: url.slice(0, 80) });

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.log.error(this.constructor.name + ' creation failed', { err: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.onOpen();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.onActivity?.();
      this.handleMessage(data);
    });

    this.ws.on('error', (err: Error) => {
      this.log.warn(this.constructor.name + ' error', { err: String(err) });
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.log.warn(this.constructor.name + ' closed', { code, reason: reason.toString() });
      this.stopHeartbeat();
      if (!this.destroyed) this.scheduleReconnect();
    });
  }

  // ── Reconnect ───────────────────────────────────────────────────────

  protected scheduleReconnect(): void {
    if (this.destroyed) return;
    const delays = this.getReconnectDelays();
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)]!;
    this.reconnectAttempt += 1;
    this.log.info(this.constructor.name + ' reconnect in', { delayMs: delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /** Override to customize reconnect delay sequence. */
  protected getReconnectDelays(): number[] {
    return DEFAULT_RECONNECT_DELAYS_MS;
  }

  // ── Heartbeat ───────────────────────────────────────────────────────

  protected startHeartbeat(): void {
    this.stopHeartbeat();
    const intervalMs = this.buildHeartbeatIntervalMs();
    if (intervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), intervalMs);
  }

  protected stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Override to send a heartbeat message. Default: no-op. */
  protected sendHeartbeat(): void {
    // No-op by default — overridden when the protocol requires it.
  }

  // ── Send ────────────────────────────────────────────────────────────

  protected send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  protected isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  protected clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
  }
}
