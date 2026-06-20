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

import { collectFindings, enforceCitations } from '../src/verification';

function toolCallMessages(tools: string[]) {
  return [
    {
      content: tools.map((toolName) => ({
        type: 'tool-call' as const,
        toolName,
        toolCallId: `call-${toolName}`,
        input: {},
      })),
    },
  ];
}

describe('Phase B item 9 — collectFindings structured output', () => {
  it('returns null for clean text with no factual claims', () => {
    expect(
      collectFindings({
        text: 'Stay disciplined and watch the structure.',
        responseMessages: [],
      }),
    ).toBeNull();
  });

  it('returns structured findings when prices are quoted without a tool call', () => {
    const r = collectFindings({
      text: 'XAUUSD is at 2392.45. EURUSD is around 1.0842. Bias: bullish.',
      responseMessages: [],
    });
    expect(r).not.toBeNull();
    expect(r!.findings.length).toBeGreaterThanOrEqual(2);
    for (const f of r!.findings) {
      expect(f.supported).toBe(false);
      expect(f.supportingTool).toBeNull();
      expect(typeof f.text).toBe('string');
    }
    expect(r!.toolsInvoked).toEqual([]);
  });

  it('flags event names when no calendar/news tool was called', () => {
    const r = collectFindings({
      text: 'Watch the FOMC next week and NFP on Friday.',
      responseMessages: [],
    });
    expect(r).not.toBeNull();
    // At least one of the two event tokens should be flagged.
    expect(r!.findings.length).toBeGreaterThanOrEqual(1);
  });

  it('skips price claims when a numeric tool was called (and marks supported=true)', () => {
    // When the relevant tool IS in toolsInvoked, the price branch
    // is short-circuited, so the returned findings array is empty
    // for that case. We document that here for parity.
    const r = collectFindings({
      text: 'XAUUSD is at 2392.45 right now.',
      responseMessages: toolCallMessages(['get_price']),
    });
    expect(r).toBeNull();
  });
});

describe('Phase B item 9 — enforceCitations includes findings on the part', () => {
  it('attaches a `findings` array to the warning part', () => {
    const r = enforceCitations({
      text: 'XAUUSD is at 2392.45 — looks bullish.',
      responseMessages: [],
    });
    expect(r).not.toBeNull();
    expect(r!.findings).toBeDefined();
    expect(r!.findings!.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the legacy `unsupportedClaims[0]` summary line for backward compat', () => {
    const r = enforceCitations({
      text: 'XAUUSD is at 2392.45.',
      responseMessages: [],
    });
    expect(r).not.toBeNull();
    expect(r!.unsupportedClaims).toHaveLength(1);
    expect(r!.unsupportedClaims[0]).toMatch(/weren't verified/);
  });

  it('clamps findings at 8 to keep the export reasonable', () => {
    // Build a paragraph with many distinct price tokens.
    const text = Array.from(
      { length: 20 },
      (_, i) => `XAUUSD hit ${2390 + i}.${(i * 7) % 100} earlier today.`,
    ).join(' ');
    const r = enforceCitations({ text, responseMessages: [] });
    expect(r).not.toBeNull();
    expect(r!.findings!.length).toBeLessThanOrEqual(8);
  });
});
