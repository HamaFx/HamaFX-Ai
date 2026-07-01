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
import type { UIMessage } from 'ai';

import { routeTurn } from '../src/routing';

function userMessage(text: string, image = false): UIMessage {
  const parts: UIMessage['parts'] = [{ type: 'text', text }];
  if (image) {
    parts.push({ type: 'file', mediaType: 'image/png', url: 'https://example.com/chart.png' });
  }
  return { id: 'm1', role: 'user', parts };
}

const env = { AI_DEFAULT_MODEL: 'test-model' };

describe('routeTurn — Phase 0.7 offline eval (tool-selection)', () => {
  it('routes fundamental questions to the fundamental domain with planning', () => {
    const result = routeTurn({ userMessage: userMessage('Why is gold rallying after the FOMC?'), env });
    expect(result.domain).toBe('fundamental');
    expect(result.planRequired).toBe(true);
  });

  it('routes technical questions to the technical domain with planning', () => {
    const result = routeTurn({ userMessage: userMessage('What is the RSI on the EURUSD 1h chart?'), env });
    expect(result.domain).toBe('technical');
    expect(result.planRequired).toBe(true);
  });

  it('routes summary/recap questions to the summary domain', () => {
    const result = routeTurn({ userMessage: userMessage('Summarize today’s news and calendar'), env });
    expect(result.domain).toBe('summary');
    expect(result.planRequired).toBe(false);
  });

  it('routes image messages to the vision domain', () => {
    const result = routeTurn({ userMessage: userMessage('Analyze this chart', true), env });
    expect(result.domain).toBe('vision');
    expect(result.planRequired).toBe(false);
  });

  it('falls back to generic for ambiguous short messages', () => {
    const result = routeTurn({ userMessage: userMessage('hi'), env });
    expect(result.domain).toBe('generic');
    expect(result.planRequired).toBe(false);
  });

  it('honours explicit model override as generic', () => {
    const result = routeTurn({
      userMessage: userMessage('Why is gold rallying?'),
      env,
      modelOverride: 'google/gemini-2.5-pro',
    });
    expect(result.domain).toBe('generic');
    expect(result.rationale).toMatch(/explicit override/);
  });
});
