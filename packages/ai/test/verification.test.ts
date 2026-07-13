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

// P3-13 — Unit tests for citation enforcement (verification.ts).

import { describe, expect, it } from 'vitest';
import { PRICE_TOKEN, EVENT_TOKEN, ATTRIBUTION_TOKEN } from '../src/verification/regex';
import { collectFindings } from '../src/verification';

describe('PRICE_TOKEN', () => {
  it('matches gold prices in the 1xxx-4xxx range', () => {
    expect(PRICE_TOKEN.test('XAUUSD at 2650.50')).toBe(true);

    const match = '2650.50'.match(PRICE_TOKEN);
    expect(match).not.toBeNull();
    expect(match![0]).toBe('2650.50');
  });

  it('matches FX prices like 1.0850 or 0.8600', () => {
    expect('1.0850'.match(PRICE_TOKEN)).not.toBeNull();
    expect('0.8600'.match(PRICE_TOKEN)).not.toBeNull();
    expect('1.08500'.match(PRICE_TOKEN)).not.toBeNull();
  });

  it('does not match version-like strings (1.0) or timestamps (2026.05.27)', () => {
    expect('1.0'.match(PRICE_TOKEN)).toBeNull();
    expect('2026.05.27'.match(PRICE_TOKEN)).toBeNull();
    expect('1.0.0'.match(PRICE_TOKEN)).toBeNull();
  });

  it('extracts multiple gold prices from text', () => {
    const text = 'Gold support at 2620.00 with resistance at 2680.50';
    const matches = text.match(PRICE_TOKEN);
    expect(matches).toEqual(['2620.00', '2680.50']);
  });
});

describe('EVENT_TOKEN', () => {
  it('matches common macro event abbreviations', () => {
    // Use 'i' only — .test() with /g carries lastIndex state across calls.
    const ev = new RegExp(EVENT_TOKEN.source, 'i');
    expect(ev.test('NFP report')).toBe(true);
    expect(ev.test('FOMC minutes released')).toBe(true);
    expect(ev.test('CPI data today')).toBe(true);
    expect(ev.test('ECB decision')).toBe(true);
  });

  it('does not match unrelated words', () => {
    expect(EVENT_TOKEN.test('nothing special today')).toBe(false);
  });
});

describe('ATTRIBUTION_TOKEN', () => {
  it('matches explicit attribution phrases', () => {
    expect(ATTRIBUTION_TOKEN.test('according to Reuters')).toBe(true);
    expect(ATTRIBUTION_TOKEN.test('reported by Bloomberg')).toBe(true);
    expect(ATTRIBUTION_TOKEN.test('cited by the Fed')).toBe(true);
  });

  it('does not match bare "from"', () => {
    expect(ATTRIBUTION_TOKEN.test('from the previous high')).toBe(false);
    expect(ATTRIBUTION_TOKEN.test('data from yesterday')).toBe(false);
  });
});

describe('collectFindings', () => {
  it('returns null for empty text', () => {
    expect(collectFindings({ text: '', responseMessages: [] })).toBeNull();
  });

  it('flags unsupported price claims when no numeric tools were invoked', () => {
    const text = 'Gold is trading at 2650.50 with support at 2620.00.';
    const result = collectFindings({ text, responseMessages: [] });
    expect(result).not.toBeNull();
    expect(result!.findings.length).toBeGreaterThan(0);
    expect(result!.toolsInvoked).toEqual([]);
  });

  it('does not flag when numeric tools were invoked', () => {
    const text = 'Gold is trading at 2650.50 with support at 2620.00.';
    const responseMessages = [{
      content: [{ type: 'tool-call', toolName: 'get_price' }],
    }];
    const result = collectFindings({ text, responseMessages });
    expect(result).toBeNull();
  });

  it('returns the invoked tool names in toolsInvoked', () => {
    const text = 'Gold at 2650.50';
    const responseMessages = [{
      content: [
        { type: 'tool-call', toolName: 'get_price' },
        { type: 'tool-call', toolName: 'get_candles' },
      ],
    }];
    // Price claims are covered by the numeric tools, so no findings expected.
    const result = collectFindings({ text, responseMessages });
    expect(result).toBeNull();
    // But we can verify toolsInvoked via a separate test with unsupported text.
    const result2 = collectFindings({
      text: 'NFP and CPI both suggest...',
      responseMessages,
    });
    expect(result2).not.toBeNull();
    expect(result2!.toolsInvoked).toContain('get_price');
    expect(result2!.toolsInvoked).toContain('get_candles');
  });

  it('flags unsupported event claims when no news tools were invoked', () => {
    const text = 'The NFP report and CPI data suggest...';
    const result = collectFindings({ text, responseMessages: [] });
    expect(result).not.toBeNull();
    expect(result!.findings.length).toBeGreaterThan(0);
  });

  it('does not flag event claims when news tools were invoked', () => {
    const text = 'The NFP report suggests...';
    const responseMessages = [{
      content: [{ type: 'tool-call', toolName: 'get_news' }],
    }];
    const result = collectFindings({ text, responseMessages });
    expect(result).toBeNull();
  });

  it('caps findings at 8', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Price ${1000 + i}.00`).join(' ');
    const result = collectFindings({ text, responseMessages: [] });
    expect(result).not.toBeNull();
    expect(result!.findings.length).toBeLessThanOrEqual(8);
  });
});
