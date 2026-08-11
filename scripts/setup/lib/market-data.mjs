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

/**
 * Market data providers offered by the wizard. Keys are stored at the
 * env level (FINNHUB_API_KEY etc.) and are optional — the app works
 * without any of them.
 */

export const MARKET_DATA_PROVIDERS = [
  {
    id: 'finnhub',
    label: 'Finnhub',
    envKey: 'FINNHUB_API_KEY',
    hint: 'Stocks, forex, crypto news',
    url: 'https://finnhub.io/dashboard',
    minLen: 15,
  },
  {
    id: 'marketaux',
    label: 'Marketaux',
    envKey: 'MARKETAUX_API_KEY',
    hint: 'Financial news feed',
    url: 'https://marketaux.com/dashboard',
    minLen: 15,
  },
  {
    id: 'fred',
    label: 'FRED (Federal Reserve)',
    envKey: 'FRED_API_KEY',
    hint: 'Economic data & calendar',
    url: 'https://fredaccount.stlouisfed.org/apikeys',
    minLen: 20,
  },
  {
    id: 'alphavantage',
    label: 'Alpha Vantage',
    envKey: 'ALPHAVANTAGE_API_KEY',
    hint: 'Stocks, forex, indicators',
    url: 'https://www.alphavantage.co/support/#api-key',
    minLen: 10,
  },
];

export function providerById(id) {
  return MARKET_DATA_PROVIDERS.find((p) => p.id === id);
}

/** Map a comma-separated --market flag value to provider ids. */
export function parseMarketFlag(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => MARKET_DATA_PROVIDERS.some((p) => p.id === s));
}
