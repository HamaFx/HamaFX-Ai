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

import { EventEmitter } from 'node:events';
import { getDb, schema } from '@hamafx/db';
import {
  getSymbolDefinition,
  isKnownSymbol,
  symbolCategory,
  type SymbolCategory,
} from '@hamafx/shared';
import type { Logger } from './log.js';

interface ActiveSymbol {
  symbol: string;
  category: SymbolCategory;
  watchlistCount: number;
}

export interface SymbolChangeEvent {
  current: string[];
  added: string[];
  removed: string[];
}

export interface PerConsumerChangeEvent {
  symbols: string[];
  added: string[];
  removed: string[];
}

export class SymbolManager extends EventEmitter {
  private symbols: Set<string> = new Set();
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private consecutiveFailures = 0;

  constructor(
    private readonly log: Logger,
    private readonly pollIntervalMs = 60_000,
  ) {
    super();
  }

  /**
   * Start polling the database for active symbols.
   * Emits per-consumer events when symbol sets change:
   *   - 'biquoteChanged' → BiQuote consumer updates (all forex/gold)
   *   - 'binanceChanged' → Binance consumer updates (all crypto)
   *   - 'symbolsChanged' → aggregate event (backward compat)
   */
  public start(): void {
    if (this.pollTimer) return;
    
    // Initial fetch
    void this.poll();

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    
    this.log.info('SymbolManager started polling', { intervalMs: this.pollIntervalMs });
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public getSymbols(): string[] {
    return Array.from(this.symbols);
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const db = getDb();
      // Fetch distinct symbols from user watchlists with count for popularity
      const rows = await db
        .selectDistinct({ symbol: schema.userSymbols.symbol })
        .from(schema.userSymbols);

      const newSymbols = new Set(
        rows.map((r) => r.symbol).filter((s) => isKnownSymbol(s)),
      );
      
      // If the database has no symbols, fallback to defaults
      if (newSymbols.size === 0) {
        newSymbols.add('XAUUSD');
        newSymbols.add('EURUSD');
        newSymbols.add('GBPUSD');
      }

      if (this.hasSetChanged(this.symbols, newSymbols)) {
        const added = Array.from(newSymbols).filter((s) => !this.symbols.has(s));
        const removed = Array.from(this.symbols).filter((s) => !newSymbols.has(s));
        
        // Capture old symbols BEFORE updating this.symbols — needed for correct
        // diff computation in per-consumer events (biquoteChanged, binanceChanged).
        const oldSymbols = new Set(this.symbols);
        this.symbols = newSymbols;

        // Build active symbol list with categories
        const activeSymbols: ActiveSymbol[] = Array.from(this.symbols).map((s) => ({
          symbol: s,
          category: symbolCategory(s) ?? 'forex',
          watchlistCount: 1, // TODO: aggregate from DB for real popularity
        }));

        // Emit aggregate event (backward compat)
        this.emit('symbolsChanged', { 
          current: Array.from(this.symbols),
          added,
          removed,
        });

        // Emit per-consumer events
        const biquoteSymbols = activeSymbols
          .filter((s) => s.category === 'forex' || s.category === 'gold')
          .map((s) => s.symbol);
        const prevBiquote = Array.from(oldSymbols).filter(
          (s) => symbolCategory(s) === 'forex' || symbolCategory(s) === 'gold',
        );
        this.emit('biquoteChanged', {
          symbols: biquoteSymbols,
          added: biquoteSymbols.filter((s) => !prevBiquote.includes(s)),
          removed: prevBiquote.filter((s) => !biquoteSymbols.includes(s)),
        });

        const binanceSymbols = activeSymbols
          .filter((s) => s.category === 'crypto')
          .map((s) => getSymbolDefinition(s.symbol).binance ?? s.symbol);
        const prevBinance = Array.from(oldSymbols)
          .filter((s) => symbolCategory(s) === 'crypto')
          .map((s) => getSymbolDefinition(s).binance ?? s);
        this.emit('binanceChanged', {
          symbols: binanceSymbols,
          added: binanceSymbols.filter((s) => !prevBinance.includes(s)),
          removed: prevBinance.filter((s) => !binanceSymbols.includes(s)),
        });
        
        // Reset failure counter on successful poll
        this.consecutiveFailures = 0;

        this.log.info('Active symbols changed', { 
          total: this.symbols.size, 
          biquote: biquoteSymbols.length,
          binance: binanceSymbols.length,
          added, 
          removed,
        });
      }
    } catch (err) {
      this.consecutiveFailures += 1;
      this.log.error('Failed to poll user symbols', { err: String(err) });
      if (this.consecutiveFailures >= 5) {
        this.log.warn('SymbolManager: 5+ consecutive poll failures — symbols may be stale');
      }
    } finally {
      this.isPolling = false;
    }
  }

  private hasSetChanged(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return true;
    for (const item of a) {
      if (!b.has(item)) return true;
    }
    return false;
  }
}
