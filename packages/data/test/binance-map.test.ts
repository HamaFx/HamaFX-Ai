/**
 * Copyright 2026 Kestrel
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

import { describe, expect, it } from 'vitest';

import { fetchTickerPrice } from '../src/providers/binance/rest';
import { isCryptoSymbol, toBinanceInterval } from '../src/providers/binance/map';

describe('Binance symbol boundary', () => {
  it('accepts every canonical crypto symbol', () => {
    expect(isCryptoSymbol('BTCUSDT')).toBe(true);
    expect(isCryptoSymbol('ethusdt')).toBe(true);
    expect(isCryptoSymbol('SOLUSDT')).toBe(true);
    expect(isCryptoSymbol('BNBUSDT')).toBe(true);
    expect(isCryptoSymbol('XRPUSDT')).toBe(true);
    expect(isCryptoSymbol('ADAUSDT')).toBe(true);
  });

  it('rejects non-crypto symbols and unsupported exchange aliases', () => {
    expect(isCryptoSymbol('XAUUSD')).toBe(false);
    expect(isCryptoSymbol('EURUSD')).toBe(false);
    expect(isCryptoSymbol('BTCUSD')).toBe(false);
    expect(isCryptoSymbol('DOGEUSDT')).toBe(false);
    expect(isCryptoSymbol('US100')).toBe(false);
  });

  it('rejects unsupported ticker symbols before any network request', async () => {
    await expect(fetchTickerPrice('BTCUSD')).rejects.toThrow(/canonical crypto pairs/);
    await expect(fetchTickerPrice('DOGEUSDT')).rejects.toThrow(/canonical crypto pairs/);
  });

  it('keeps timeframe mapping independent from symbol routing', () => {
    expect(toBinanceInterval('1h')).toBe('1h');
    expect(toBinanceInterval('1w')).toBe('1w');
  });
});
