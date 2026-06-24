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

import type { Symbol, Timeframe, Tick, Candle } from '@hamafx/shared';
import type { MarketDataProvider } from './market-data-provider';
import * as biquote from './biquote';
import * as finnhub from './finnhub';
import { fetchLiveTick } from './live-ticks';
import { fetchCandles1m } from './candles-1m';
import { CandleSchema } from '@hamafx/shared';

export const biquoteProvider: MarketDataProvider = {
  id: 'biquote',
  displayName: 'BiQuote REST',
  async testConnection(apiKeys?: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    try {
      const baseUrl = apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
      await biquote.fetchTick('XAUUSD', { baseUrl, skipThrottle: true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
  async fetchTick(symbol: Symbol, options?: { signal?: AbortSignal; apiKeys?: Record<string, string> }): Promise<Tick> {
    const baseUrl = options?.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
    const tick = await biquote.fetchTick(symbol, {
      baseUrl,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return {
      symbol,
      bid: tick.mid,
      ask: tick.mid,
      mid: tick.mid,
      ts: Date.now(),
      source: 'biquote',
    };
  },
  async fetchCandles(symbol: Symbol, tf: Timeframe, count: number, options?: { signal?: AbortSignal; apiKeys?: Record<string, string> }): Promise<Candle[]> {
    const baseUrl = options?.apiKeys?.biquoteBaseUrl ?? process.env.BIQUOTE_BASE_URL ?? 'https://biquote.io';
    const raw = await biquote.fetchOhlc({
      symbol,
      tf,
      count,
      baseUrl,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    const fetchedAt = Date.now();
    return raw.map((bar) =>
      CandleSchema.parse({
        symbol,
        tf,
        t: Date.parse(bar.openTime),
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        v: bar.volume > 0 ? bar.volume : null,
        source: 'biquote',
        fetchedAt,
      }),
    );
  }
};

export const finnhubProvider: MarketDataProvider = {
  id: 'finnhub',
  displayName: 'Finnhub REST',
  async testConnection(apiKeys?: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    try {
      const apiKey = apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY;
      if (!apiKey) {
        return { ok: false, error: 'Finnhub API Key is required' };
      }
      await finnhub.fetchPrice('XAUUSD', { apiKey });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
  async fetchTick(symbol: Symbol, options?: { signal?: AbortSignal; apiKeys?: Record<string, string> }): Promise<Tick> {
    const apiKey = options?.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '';
    const res = await finnhub.fetchPrice(symbol, {
      apiKey,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return {
      symbol,
      bid: res.price,
      ask: res.price,
      mid: res.price,
      ts: Date.now(),
      source: 'finnhub',
    };
  },
  async fetchCandles(symbol: Symbol, tf: Timeframe, count: number, options?: { signal?: AbortSignal; apiKeys?: Record<string, string> }): Promise<Candle[]> {
    const apiKey = options?.apiKeys?.finnhub ?? process.env.FINNHUB_API_KEY ?? '';
    const raw = await finnhub.fetchCandles({
      symbol,
      tf,
      count,
      apiKey,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    const fetchedAt = Date.now();
    return raw.map((bar) =>
      CandleSchema.parse({
        symbol,
        tf,
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
        source: 'finnhub',
        fetchedAt,
      }),
    );
  }
};

export const liveTicksProvider: MarketDataProvider = {
  id: 'live-ticks',
  displayName: 'Live Ticks (Worker)',
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await fetchLiveTick({ symbol: 'XAUUSD' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
  async fetchTick(symbol: Symbol): Promise<Tick> {
    const r = await fetchLiveTick({ symbol });
    return {
      symbol,
      bid: r.price,
      ask: r.price,
      mid: r.price,
      ts: Date.now(),
      source: r.provider,
    };
  },
  async fetchCandles(symbol: Symbol, tf: Timeframe, count: number): Promise<Candle[]> {
    if (tf !== '1m') {
      throw new Error('live-ticks provider only supports 1m timeframe');
    }
    const r = await fetchCandles1m({ symbol, count });
    const fetchedAt = Date.now();
    return r.bars.map((bar) =>
      CandleSchema.parse({
        symbol,
        tf,
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
        source: r.provider,
        fetchedAt,
      }),
    );
  }
};

export const MARKET_DATA_PROVIDERS: Record<string, MarketDataProvider> = {
  'biquote': biquoteProvider,
  'finnhub': finnhubProvider,
  'live-ticks': liveTicksProvider,
};
