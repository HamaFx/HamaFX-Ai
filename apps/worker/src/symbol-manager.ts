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
import { isSymbol } from '@hamafx/shared';
import type { Logger } from './log.js';

export class SymbolManager extends EventEmitter {
  private symbols: Set<string> = new Set();
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly log: Logger,
    private readonly pollIntervalMs = 60_000,
  ) {
    super();
  }

  /**
   * Start polling the database for active symbols.
   * Emits 'symbolsChanged' when the aggregate list changes.
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
      // Fetch distinct symbols from user watchlists
      const rows = await db
        .selectDistinct({ symbol: schema.userSymbols.symbol })
        .from(schema.userSymbols);

      const newSymbols = new Set(rows.map((r) => r.symbol).filter(isSymbol));
      
      // If the database has no symbols, fallback to defaults just to keep the connection alive
      if (newSymbols.size === 0) {
        newSymbols.add('XAUUSD');
        newSymbols.add('EURUSD');
        newSymbols.add('GBPUSD');
      }

      if (this.hasSetChanged(this.symbols, newSymbols)) {
        const added = Array.from(newSymbols).filter((s) => !this.symbols.has(s));
        // Type-guard: this.symbols is `Set<string>` but newSymbols is the
        // narrowed union, so `.has(s)` rejects plain strings without a guard.
        const removed = Array.from(this.symbols).filter(
          (s): s is 'XAUUSD' | 'EURUSD' | 'GBPUSD' => isSymbol(s) && !newSymbols.has(s),
        );
        
        this.symbols = newSymbols;
        this.emit('symbolsChanged', { 
          current: Array.from(this.symbols),
          added,
          removed 
        });
        
        this.log.info('Active symbols changed', { 
          total: this.symbols.size, 
          added, 
          removed 
        });
      }
    } catch (err) {
      this.log.error('Failed to poll user symbols', { err: String(err) });
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
