/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from 'vitest';

import { routeTurn } from '../src/routing';

const ENV = {
  AI_DEFAULT_MODEL: 'google-vertex/gemini-2.5-flash',
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
  it('falls back to generic on empty/short input', () => {
    const r = routeTurn({ userMessage: userText('hi'), env: ENV });
    expect(r.domain).toBe('generic');
    expect(r.planRequired).toBe(false);
  });

  it('routes fundamental analysis prompts to the fundamental domain', () => {
    const r = routeTurn({
      userMessage: userText('Why is gold selling off after the FOMC minutes? Macro view?'),
      env: ENV,
    });
    expect(r.domain).toBe('fundamental');
    expect(r.planRequired).toBe(true);
  });

  it('routes technical analysis prompts to the technical domain', () => {
    const r = routeTurn({
      userMessage: userText('Top-down read on EURUSD with RSI and EMA50 across 4H and 1H'),
      env: ENV,
    });
    expect(r.domain).toBe('technical');
    expect(r.planRequired).toBe(true);
  });

  it('routes news/calendar/journal summaries to the summary domain', () => {
    const r1 = routeTurn({
      userMessage: userText("Summarise today's gold-relevant news"),
      env: ENV,
    });
    expect(r1.domain).toBe('summary');
    expect(r1.planRequired).toBe(false);

    const r2 = routeTurn({
      userMessage: userText('What did I trade this week and what was my win rate?'),
      env: ENV,
    });
    expect(r2.domain).toBe('summary');
  });

  it('routes image-attached turns to the vision domain', () => {
    const r = routeTurn({ userMessage: userImage(), env: ENV });
    expect(r.domain).toBe('vision');
  });

  it('explicit modelOverride wins over the classifier', () => {
    const r = routeTurn({
      userMessage: userText('Why is the dollar strong'),
      env: ENV,
      modelOverride: 'openai/gpt-4.1',
    });
    expect(r.domain).toBe('generic');
    expect(r.rationale).toContain('openai/gpt-4.1');
  });

  it('null modelOverride is ignored (treated as no override)', () => {
    const r = routeTurn({
      userMessage: userText('Macro view on gold'),
      env: ENV,
      modelOverride: null,
    });
    expect(r.domain).toBe('fundamental');
  });
});
