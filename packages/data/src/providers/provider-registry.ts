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

// P2-2 — Market Data Provider Plugin Registry.
//
// Replaces hardcoded provider imports in price.ts / candles.ts adapters
// with a plugin discovery system. Adding a new market data provider
// (e.g. Polygon, Alpha Vantage) means registering a plugin — no adapter
// code changes (OCP).
//
// Pattern mirrors ToolRegistry, IndicatorRegistry, and AlertRuleRegistry.

import type { Symbol, Candle, Timeframe } from '@hamafx/shared';

// --- Plugin interface ----------------------------------------------------

/** Options passed to every provider fetch call. */
export interface ProviderFetchOptions {
  signal?: AbortSignal;
  /** Per-call API key overrides (for tests / multi-tenant). */
  apiKey?: string;
  /** Per-call base URL override. */
  baseUrl?: string;
}

/**
 * A market data provider plugin.
 *
 * Each provider implements fetchPrice (latest tick) and optionally
 * fetchCandles (OHLCV history). Providers that don't support candles
 * are skipped by the candles adapter.
 *
 * Capability methods (all optional — providers declare what they can do):
 *   - fetchCandles  — OHLCV history. Returns null when unsupported.
 *   - testConnection — connectivity probe for the settings UI.
 *   - supports       — per-provider guard: can this provider serve this
 *                      symbol/timeframe at all?
 */
export interface MarketDataProvider {
  /** Unique provider name (e.g. 'biquote', 'finnhub', 'binance'). */
  readonly name: string;
  /** Human-readable label for catalogues / debugging. */
  readonly label: string;
  /** Whether this provider should always be tried first (pinned). */
  readonly pinned?: boolean;
  /**
   * Fetch the latest price for a symbol.
   * Returns the price, provider name, and optionally the data age in ms
   * (for SWR staleness tracking with live-tick providers).
   */
  fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions): Promise<{
    price: number;
    provider: string;
    /** ms since the upstream observed the value. null for REST providers. */
    ageMs?: number | null;
  }>;
  /**
   * Fetch OHLCV candles. Returns null when the provider cannot serve this
   * symbol/timeframe (no throw — callers skip null gracefully).
   */
  fetchCandles?(symbol: Symbol, tf: Timeframe, count: number, opts?: ProviderFetchOptions): Promise<Candle[] | null>;
  /**
   * Optional connectivity probe for the settings "test provider" button.
   * Returns { ok: true } on success, { ok: false, error } on failure.
   */
  testConnection?(opts?: ProviderFetchOptions): Promise<{ ok: boolean; error?: string }>;
  /**
   * Optional per-provider guard: can this provider serve this symbol/tf?
   * Defaults to true when not implemented (provider is tried unconditionally).
   */
  supports?(symbol: Symbol, tf?: Timeframe): boolean;
}

// --- Registry ------------------------------------------------------------

export class MarketDataProviderRegistry {
  private providers = new Map<string, MarketDataProvider>();

  register(provider: MarketDataProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): MarketDataProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Unknown market data provider: "${name}". Registered: ${this.listNames().join(', ')}`);
    return p;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  /** List all registered providers in priority order (pinned first). */
  list(): MarketDataProvider[] {
    return [...this.providers.values()].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
  }

  listNames(): string[] {
    return this.list().map((p) => p.name);
  }
}

/** Global singleton. */
export const marketDataProviders = new MarketDataProviderRegistry();
