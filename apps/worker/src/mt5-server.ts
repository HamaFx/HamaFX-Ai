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

import * as net from 'net';
import { isKnownSymbol, type Symbol } from '@hamafx/shared';
import type { Logger } from './log.js';
import type { NormalizedTick } from './signalr/consumer.js';

export interface MT5ServerOptions {
  port: number;
  log: Logger;
  onTick: (tick: NormalizedTick) => void;
}

export interface MT5ServerHandle {
  stop(): Promise<void>;
}

export function startMT5Server(opts: MT5ServerOptions): MT5ServerHandle {
  const { port, log, onTick } = opts;
  
  const server = net.createServer((socket) => {
    log.info('MT5 Terminal connected to Linux bridge');
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      
      // Handle newline-delimited JSON frames
      let boundary = buffer.indexOf('\n');
      while (boundary !== -1) {
        const frame = buffer.substring(0, boundary).trim();
        buffer = buffer.substring(boundary + 1);
        
        if (frame) {
          try {
            const raw = JSON.parse(frame);
            const symbol = String(raw.symbol).toUpperCase();
            
            if (!isKnownSymbol(symbol)) {
              log.warn('MT5 Bridge received unsupported symbol', { symbol });
              boundary = buffer.indexOf('\n');
              continue;
            }
            
            const bid = Number(raw.bid);
            const ask = Number(raw.ask);
            if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
              log.warn('MT5 Bridge received invalid bid/ask', { bid, ask, symbol });
              boundary = buffer.indexOf('\n');
              continue;
            }
            
            const mid = (bid + ask) / 2;
            const ts = Number(raw.ts) || Date.now();
            
            const tick: NormalizedTick = {
              symbol: symbol as Symbol,
              bid,
              ask,
              mid,
              ts,
              source: 'mt5-local',
            };
            
            onTick(tick);
          } catch (e) {
            log.error('Failed to parse frame from MT5', { error: String(e), frame });
          }
        }
        boundary = buffer.indexOf('\n');
      }
    });

    socket.on('close', () => {
      log.warn('MT5 Bridge client disconnected');
    });

    socket.on('error', (err) => {
      log.error('MT5 Bridge socket error', { error: String(err) });
    });
  });

  server.listen(port, '127.0.0.1', () => {
    log.info('Headless MT5 Bridge Server active', { address: '127.0.0.1', port });
  });

  return {
    stop(): Promise<void> {
      return new Promise<void>((resolve) => {
        server.close(() => {
          log.info('Headless MT5 Bridge Server closed');
          resolve();
        });
      });
    },
  };
}
