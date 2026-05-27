import { describe, expect, it } from 'vitest';

import { routeTurn } from '../src/routing';

const ENV = {
  AI_DEFAULT_MODEL: 'google-vertex/gemini-2.5-flash',
  AI_FUNDAMENTAL_MODEL: 'google-vertex/gemini-2.5-pro',
  AI_TECHNICAL_MODEL: 'google-vertex/gemini-2.5-flash',
  AI_SUMMARY_MODEL: 'google-vertex/gemini-2.5-flash-lite',
  AI_VISION_MODEL: 'google-vertex/gemini-2.5-pro',
} as const;

function userText(text: string): Parameters<typeof routeTurn>[0]['userMessage'] {
  return {
    id: 'u',
    role: 'user',
    parts: [{ type: 'text', text }],
  } as never;
}

function userImage(): Parameters<typeof routeTurn>[0]['userMessage'] {
  return {
    id: 'u',
    role: 'user',
    parts: [
      { type: 'text', text: 'analyse this' },
      { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,xx' },
    ],
  } as never;
}

describe('routeTurn — Phase 7a domain routing', () => {
  it('falls back to AI_DEFAULT_MODEL on empty/short input', () => {
    const r = routeTurn({ userMessage: userText('hi'), env: ENV });
    expect(r.domain).toBe('generic');
    expect(r.modelId).toBe(ENV.AI_DEFAULT_MODEL);
    expect(r.planRequired).toBe(false);
  });

  it('routes fundamental analysis prompts to the pro model', () => {
    const r = routeTurn({
      userMessage: userText('Why is gold selling off after the FOMC minutes? Macro view?'),
      env: ENV,
    });
    expect(r.domain).toBe('fundamental');
    expect(r.modelId).toBe(ENV.AI_FUNDAMENTAL_MODEL);
    expect(r.planRequired).toBe(true);
  });

  it('routes technical analysis prompts to the technical model', () => {
    const r = routeTurn({
      userMessage: userText('Top-down read on EURUSD with RSI and EMA50 across 4H and 1H'),
      env: ENV,
    });
    expect(r.domain).toBe('technical');
    expect(r.modelId).toBe(ENV.AI_TECHNICAL_MODEL);
    expect(r.planRequired).toBe(true);
  });

  it('routes news/calendar/journal summaries to the cheap summary model', () => {
    const r1 = routeTurn({
      userMessage: userText("Summarise today's gold-relevant news"),
      env: ENV,
    });
    expect(r1.domain).toBe('summary');
    expect(r1.modelId).toBe(ENV.AI_SUMMARY_MODEL);
    expect(r1.planRequired).toBe(false);

    const r2 = routeTurn({
      userMessage: userText('What did I trade this week and what was my win rate?'),
      env: ENV,
    });
    expect(r2.domain).toBe('summary');
  });

  it('routes image-attached turns to the vision model regardless of text', () => {
    const r = routeTurn({ userMessage: userImage(), env: ENV });
    expect(r.domain).toBe('vision');
    expect(r.modelId).toBe(ENV.AI_VISION_MODEL);
  });

  it('explicit modelOverride wins over the classifier', () => {
    const r = routeTurn({
      userMessage: userText('Why is the dollar strong'),
      env: ENV,
      modelOverride: 'openai/gpt-4.1',
    });
    expect(r.domain).toBe('generic');
    expect(r.modelId).toBe('openai/gpt-4.1');
  });

  it('null modelOverride is ignored (treated as no override)', () => {
    const r = routeTurn({
      userMessage: userText('Macro view on gold'),
      env: ENV,
      modelOverride: null,
    });
    expect(r.domain).toBe('fundamental');
  });

  it('falls back to AI_DEFAULT_MODEL when domain env var is unset', () => {
    const partial = { ...ENV, AI_TECHNICAL_MODEL: undefined } as never;
    const r = routeTurn({
      userMessage: userText('RSI divergence on GBPUSD 1H'),
      env: partial,
    });
    expect(r.domain).toBe('technical');
    expect(r.modelId).toBe(ENV.AI_DEFAULT_MODEL);
  });
});
