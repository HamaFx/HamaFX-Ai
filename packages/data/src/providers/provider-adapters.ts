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

// P2-2 — Market data provider adapter wrappers + bootstrap registration.
//
// Wraps the existing provider modules (biquote, finnhub, binance,
// live-ticks) as MarketDataProvider plugins and registers them in the
// global `marketDataProviders` registry. Import this module once at
// startup; it is idempotent.
//
// After registration, adapters like price.ts can build ProviderAttempt[]
// from `marketDataProviders.list()` instead of hardcoded imports (OCP).

import type { Symbol, Tick } from '@hamafx/shared';
import { getSymbolDefinition } from '@hamafx/shared';
import { ProviderError } from '../errors';
import {
  marketDataProviders,
  type MarketDataProvider,
  type ProviderFetchOptions,
} from './provider-registry';
import * as biquote from './biquote';
import * as binance from './binance';
import * as finnhub from './finnhub';
import { fetchLiveTick } from './live-ticks';

// ── Provider adapter wrappers ────────────────────────────────────────

/** Wraps the live-ticks (Postgres snapshot) provider. */
const liveTicksProvider: MarketDataProvider = {
  name: 'live-ticks',
  label: 'Live Ticks (Worker Postgres Snapshot)',
  pinned: true,
  async fetchPrice(symbol: Symbol, _opts?: ProviderFetchOptions) {
    const r = await fetchLiveTick({ symbol });
    return { price: r.price, provider: r.provider, ageMs: r.ageMs };
  },
};

/** Wraps the BiQuote REST provider for forex/gold. */
const biquoteProvider: MarketDataProvider = {
  name: 'biquote',
  label: 'BiQuote (REST, free tier)',
  pinned: false,
  async fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions) {
    const baseUrl = opts?.baseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
    const tick = await biquote.fetchTick(symbol, {
      baseUrl,
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    const mid = tick.mid ?? ((tick.bid + tick.ask) / 2);
    return { price: mid, provider: 'biquote', ageMs: null };
  },
};

/** Wraps the Finnhub REST provider — always registered; key resolved at call time. */
function createFinnhubProvider(): MarketDataProvider {
  return {
    name: 'finnhub',
    label: 'Finnhub (REST, free tier)',
    pinned: false,
    async fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions) {
      const key = opts?.apiKey ?? process.env.FINNHUB_API_KEY;
      if (!key) {
        throw new ProviderError(
          'PROVIDER_NO_API_KEY',
          'finnhub',
          'Finnhub API key not configured — set FINNHUB_API_KEY or pass via apiKeys',
        );
      }
      const result = await finnhub.fetchPrice(symbol, {
        apiKey: key,
        ...(opts?.signal ? { signal: opts.signal } : {}),
      });
      return { price: result.price, provider: 'finnhub', ageMs: null };
    },
  };
}

/** Wraps the Binance REST provider for crypto. */
const binanceProvider: MarketDataProvider = {
  name: 'binance',
  label: 'Binance (REST, free tier)',
  pinned: false,
  async fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions) {
    const def = getSymbolDefinition(symbol);
    if (!def?.binance) {
      throw new ProviderError(
        'PROVIDER_UNSUPPORTED_SYMBOL',
        'binance',
        `Symbol ${symbol} is not available on Binance.`,
      );
    }
    const price = await binance.fetchTickerPrice(def.binance, {
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    return { price, provider: 'binance', ageMs: null };
  },
};

// ── Bootstrap ─────────────────────────────────────────────────────────

/** Build the provider list — all providers registered; key checks happen at call time. */
function buildProviderList(): MarketDataProvider[] {
  return [
    liveTicksProvider,
    biquoteProvider,
    binanceProvider,
    createFinnhubProvider(),
  ];
}

let _bootstrapped = false;

/**
 * Register all market data providers in the global registry.
 * Idempotent — safe to call multiple times.
 */
export function bootstrapMarketDataProviders(): void {
  if (_bootstrapped) return;
  for (const p of buildProviderList()) {
    marketDataProviders.register(p);
  }
  _bootstrapped = true;
}

// Auto-bootstrap on first import.
bootstrapMarketDataProviders();
