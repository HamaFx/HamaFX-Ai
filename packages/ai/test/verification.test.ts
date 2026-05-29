import { describe, expect, it } from 'vitest';

import { enforceCitations } from '../src/verification';

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

describe('citation enforcement — Phase 7c', () => {
  it('returns null when text has no factual-shaped tokens', () => {
    const r = enforceCitations({
      text: "Here's a general scenario. Watch the level.",
      responseMessages: [],
    });
    expect(r).toBeNull();
  });

  it('returns null when prices are quoted AND a numeric tool was called', () => {
    const r = enforceCitations({
      text: 'XAUUSD is trading at 2392.45 right now.',
      responseMessages: toolCallMessages(['get_price']),
    });
    expect(r).toBeNull();
  });

  it('flags a price quote when no numeric tool was called', () => {
    const r = enforceCitations({
      text: 'XAUUSD is at 2392.45 — this looks bullish.',
      responseMessages: [],
    });
    expect(r).not.toBeNull();
    expect(r?.unsupportedClaims.length).toBeGreaterThanOrEqual(1);
    expect(r?.stance).toBe('soft');
  });

  it('skips price-shaped tokens that have an attribution clue in the same sentence', () => {
    const r = enforceCitations({
      text: 'Per the latest tick, XAUUSD is at 2392.45 according to the feed.',
      responseMessages: [],
    });
    // The "according to" / "per" clue defuses the warning.
    expect(r).toBeNull();
  });

  it('flags an event mention when no calendar/news tool was called', () => {
    const r = enforceCitations({
      text: 'The next FOMC will likely move the dollar a lot.',
      responseMessages: [],
    });
    // Phase 3 hardening §5 — the warning is now a single muted footer
    // line, not a per-claim list. The headline message is the first
    // (and currently only) entry.
    expect(r).not.toBeNull();
    expect(r?.unsupportedClaims).toHaveLength(1);
    expect(r?.unsupportedClaims[0]).toMatch(/weren't verified/);
  });

  it('passes events through when get_calendar was invoked', () => {
    const r = enforceCitations({
      text: 'NFP is the biggest catalyst today.',
      responseMessages: toolCallMessages(['get_calendar']),
    });
    expect(r).toBeNull();
  });

  it('lists invoked tools so the chat part can show context', () => {
    const r = enforceCitations({
      text: 'XAUUSD at 2400.05 looks weak.',
      responseMessages: toolCallMessages(['get_news']),
    });
    expect(r).not.toBeNull();
    expect(r?.toolsInvoked).toContain('get_news');
  });
});
