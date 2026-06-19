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

// Phase 3 hardening §5 — citation enforcer precision tests.
//
// The pre-fix regex matched any decimal (`1.0`, `2024.05`) and any
// occurrence of `from` / `source`, which produced false-positive
// warnings on perfectly cited answers. The new regex bands match our
// three supported instruments only; the attribution list requires an
// explicit reference verb.

import { describe, expect, it } from 'vitest';

import { enforceCitations } from '../src/verification';

function noTools() {
  return [];
}

function withTools(names: string[]) {
  return [
    {
      content: names.map((toolName) => ({
        type: 'tool-call' as const,
        toolName,
        toolCallId: `call-${toolName}`,
        input: {},
      })),
    },
  ];
}

describe('PRICE_TOKEN — band-specific matching', () => {
  it('matches XAUUSD price-shaped values', () => {
    const r = enforceCitations({
      text: 'Gold is at 2392.45 with no support.',
      responseMessages: noTools(),
    });
    expect(r).not.toBeNull();
  });

  it('matches EURUSD price-shaped values', () => {
    const r = enforceCitations({
      text: 'EURUSD trading at 1.0843 right now.',
      responseMessages: noTools(),
    });
    expect(r).not.toBeNull();
  });

  it('does NOT match version-like decimals (1.0)', () => {
    const r = enforceCitations({
      text: 'Phase 1.0 of the migration is complete and 2.5 is next.',
      responseMessages: noTools(),
    });
    expect(r).toBeNull();
  });

  it('does NOT match timestamp-like decimals (2024.05)', () => {
    const r = enforceCitations({
      text: 'Looking at the chart from 2024.05.27 we can see a pattern.',
      responseMessages: noTools(),
    });
    expect(r).toBeNull();
  });

  it('does NOT match percentage-shaped numbers (e.g. 0.5%, 12.3%)', () => {
    const r = enforceCitations({
      text: 'Growth at 0.5 percent and inflation 3.4 percent.',
      responseMessages: noTools(),
    });
    // 0.5 has only one decimal — won't match FX band (4-5 decimals).
    // 3.4 also won't match. Both should be ignored. (No event tokens
    // in this case so the warning shouldn't fire on the event branch
    // either.)
    expect(r).toBeNull();
  });

  it('does NOT match a number with too many digits before the decimal', () => {
    // 100000.00 would only match if we extended the regex band.
    const r = enforceCitations({
      text: 'The S&P is around 5800.50.',
      responseMessages: noTools(),
    });
    expect(r).toBeNull();
  });
});

describe('ATTRIBUTION_TOKEN — strict reference verbs', () => {
  it('defuses on "according to"', () => {
    const r = enforceCitations({
      text: 'According to the latest read, XAUUSD is at 2392.45.',
      responseMessages: noTools(),
    });
    expect(r).toBeNull();
  });

  it('defuses on "per"', () => {
    const r = enforceCitations({
      text: 'Per the tick feed, EURUSD is at 1.0843.',
      responseMessages: noTools(),
    });
    expect(r).toBeNull();
  });

  it('defuses on "via"', () => {
    const r = enforceCitations({
      text: 'Via BiQuote, XAUUSD trades 2400.10.',
      responseMessages: noTools(),
    });
    expect(r).toBeNull();
  });

  it('does NOT defuse on bare "from" / "source" alone', () => {
    // The pre-fix regex accepted these, producing false negatives.
    const r = enforceCitations({
      text: 'Looking from yesterday, XAUUSD is at 2392.45 from now.',
      responseMessages: noTools(),
    });
    // No proper attribution verb → flags.
    expect(r).not.toBeNull();
  });
});

describe('Tool-call detection (not tool-result)', () => {
  it('counts tool-call parts as evidence', () => {
    const r = enforceCitations({
      text: 'XAUUSD at 2392.45 right now.',
      responseMessages: withTools(['get_price']),
    });
    expect(r).toBeNull();
  });

  it('does NOT accept a stale tool-result alone', () => {
    // A `tool-result` part that's been replayed from history shouldn't
    // count as "covered this turn".
    const messages = [
      {
        content: [
          {
            type: 'tool-result' as const,
            toolName: 'get_price',
            toolCallId: 'old-call',
            output: { ticks: [] },
          },
        ],
      },
    ];
    const r = enforceCitations({
      text: 'XAUUSD at 2392.45 right now.',
      responseMessages: messages,
    });
    expect(r).not.toBeNull();
  });
});

describe('Single-line muted footer', () => {
  it('emits exactly one summary line regardless of claim count', () => {
    const r = enforceCitations({
      text:
        'XAUUSD at 2392.45, EURUSD at 1.0843, GBPUSD at 1.2700, ' +
        'and CPI / NFP / FOMC are all driving this.',
      responseMessages: noTools(),
    });
    expect(r).not.toBeNull();
    expect(r?.unsupportedClaims).toHaveLength(1);
  });
});
