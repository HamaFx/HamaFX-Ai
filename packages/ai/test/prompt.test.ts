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

import { buildSystemPrompt } from '../src/prompt/system';
import { getMarketPhase, type MarketPhaseContext } from '@hamafx/shared';

describe('buildSystemPrompt', () => {
  it('returns the base prompt when given no snapshot', () => {
    const out = buildSystemPrompt(null);
    expect(out).toContain('XAUUSD');
    expect(out).toContain('Hard rules');
    // The base prompt mentions LIVE_SNAPSHOT as a reference; only the
    // injected header block uses "(auto-injected" — that's what should be absent.
    expect(out).not.toContain('(auto-injected');
  });

  it('includes prices and session in the snapshot block', () => {
    const out = buildSystemPrompt({
      asOf: '2026-05-26T12:00:00.000Z',
      session: 'london',
      prices: {
        XAUUSD: {
          symbol: 'XAUUSD',
          bid: 2345.6,
          ask: 2345.6,
          mid: 2345.6,
          ts: 0,
          source: 'biquote-signalr',
        },
      },
    });
    expect(out).toContain('LIVE_SNAPSHOT');
    expect(out).toContain('Session: london');
    expect(out).toContain('XAUUSD: 2345.6');
    expect(out).toContain('biquote-signalr');
  });

  it('renders an "unavailable" line when no prices fetched', () => {
    const out = buildSystemPrompt({
      asOf: '2026-05-26T12:00:00.000Z',
      session: 'off',
      prices: {},
    });
    expect(out).toContain('(price feed unavailable)');
  });

  it('mentions the next high-impact event when provided', () => {
    const out = buildSystemPrompt({
      asOf: '2026-05-26T12:00:00.000Z',
      session: 'ny',
      prices: {},
      nextHighImpactEvent: { title: 'NFP', whenIso: '2026-06-05T12:30:00Z', currency: 'USD' },
    });
    expect(out).toContain('NFP');
    expect(out).toContain('USD');
  });

  // F6 — Market phase integration in system prompt
  it('includes market phase context when provided in snapshot', () => {
    const phase = getMarketPhase(new Date('2026-06-27T14:00:00.000Z')); // Saturday — closed
    const out = buildSystemPrompt({
      asOf: '2026-06-27T14:00:00.000Z',
      session: 'off',
      prices: {},
      marketPhase: phase,
    });
    expect(out).toContain('MARKET PHASE');
    expect(out).toContain('CLOSED');
  });

  it('includes liquidity info for open sessions in market phase', () => {
    // Monday 14:00 UTC = London/NY Overlap
    const phase: MarketPhaseContext = {
      session: 'london_ny_overlap',
      liquidity: 'high',
      isOpen: true,
      nextSessionChange: { session: 'newyork', inMinutes: 180 },
      goldSpecific: { comexOpen: true },
    };
    const out = buildSystemPrompt({
      asOf: '2026-06-29T14:00:00.000Z',
      session: 'ny',
      prices: {},
      marketPhase: phase,
    });
    expect(out).toContain('MARKET PHASE');
    expect(out).toContain('London/NY Overlap');
    expect(out).toContain('high liquidity');
    expect(out).toContain('COMEX');
  });

  it('does not include market phase section when not provided', () => {
    const out = buildSystemPrompt({
      asOf: '2026-05-26T12:00:00.000Z',
      session: 'london',
      prices: {},
    });
    expect(out).not.toContain('MARKET PHASE');
  });
});
