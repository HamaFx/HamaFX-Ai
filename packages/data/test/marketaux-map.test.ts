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

import { describe, expect, it } from 'vitest';

import { aggregateSentiment, extractSymbols } from '../src/providers/marketaux/map';

describe('extractSymbols', () => {
  it('picks up explicit currency entities', () => {
    const out = extractSymbols({
      entities: [
        { type: 'currency', symbol: 'EUR' },
        { type: 'currency', symbol: 'USD' },
      ],
      title: 'Euro slides',
      snippet: null,
    });
    expect(out).toEqual(expect.arrayContaining(['EUR', 'USD']));
  });

  it('detects FX pair patterns in title text', () => {
    const out = extractSymbols({
      entities: [],
      title: 'EUR/USD breaks 1.10',
      snippet: null,
    });
    expect(out).toContain('EURUSD');
  });

  it('detects EURUSD without slash', () => {
    const out = extractSymbols({
      entities: [],
      title: 'EURUSD bullish breakout',
      snippet: null,
    });
    expect(out).toContain('EURUSD');
  });

  it('flags gold articles with both XAU tag and XAUUSD pair when USD context present', () => {
    const out = extractSymbols({
      entities: [],
      title: 'Gold rallies as Fed signals dovish hold',
      snippet: 'Dollar weakens',
    });
    expect(out).toContain('XAU');
    expect(out).toContain('XAUUSD');
  });

  it('does not double-count', () => {
    const out = extractSymbols({
      entities: [{ type: 'currency', symbol: 'EUR' }],
      title: 'EUR/USD breaks higher on EUR demand',
      snippet: null,
    });
    expect(out.filter((s) => s === 'EUR').length).toBe(1);
  });

  it('returns empty array for off-scope news', () => {
    const out = extractSymbols({
      entities: [{ type: 'equity', symbol: 'AAPL' }],
      title: 'Apple announces new iPhone',
      snippet: 'No FX angle here.',
    });
    expect(out).toHaveLength(0);
  });
});

describe('aggregateSentiment', () => {
  it('returns null when no entity has a numeric score', () => {
    expect(
      aggregateSentiment([
        { symbol: 'EUR', type: 'currency' },
        { symbol: 'USD', type: 'currency' },
      ]),
    ).toBeNull();
  });

  it('weights by match_score', () => {
    const out = aggregateSentiment([
      { symbol: 'EUR', sentiment_score: 0.9, match_score: 1 },
      { symbol: 'USD', sentiment_score: -0.5, match_score: 0.1 },
    ]);
    expect(out).not.toBeNull();
    // Heavily positive EUR dominates the weighted average.
    expect(out!.score).toBeGreaterThan(0.5);
    expect(out!.label).toBe('positive');
  });

  it('returns "neutral" within ±0.15 of zero', () => {
    const out = aggregateSentiment([{ sentiment_score: 0.05 }]);
    expect(out!.label).toBe('neutral');
  });
});
