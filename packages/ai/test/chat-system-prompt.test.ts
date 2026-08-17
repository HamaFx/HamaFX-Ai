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

import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import type { UserSettingsRow } from '@kestrel/db/schema';

import { buildTurnSystemPrompt } from '../src/chat/system-prompt';
import type { LiveSnapshot } from '../src/prompt/system';

const snapshot: LiveSnapshot = {
  asOf: new Date().toISOString(),
  session: 'london',
  prices: {},
};

const settings = {
  defaultSymbol: 'XAUUSD',
  timezone: 'UTC',
  language: 'en',
} as unknown as UserSettingsRow;

function msg(text: string): ModelMessage {
  return { role: 'user', content: text };
}

describe('buildTurnSystemPrompt', () => {
  it('appends custom instructions', () => {
    const { systemPrompt } = buildTurnSystemPrompt({
      snapshot,
      displayName: 'Trader',
      userSettings: settings,
      customInstructions: 'Always show invalidation levels.',
      resolvedModelId: 'google/gemini-2.5-flash',
      modelMessages: [msg('hello')],
    });
    expect(systemPrompt).toContain('Always show invalidation levels.');
    expect(systemPrompt).toContain('<USER_CUSTOM_INSTRUCTIONS>');
  });

  it('prepends the rolling-summary note', () => {
    const { systemPrompt } = buildTurnSystemPrompt({
      snapshot,
      displayName: null,
      userSettings: settings,
      compactionExtraSystem: 'Previously: user asked about EURUSD.',
      resolvedModelId: 'google/gemini-2.5-flash',
      modelMessages: [msg('what next?')],
    });
    expect(systemPrompt.indexOf('Previously: user asked about EURUSD.')).toBe(0);
  });

  it('returns messages unchanged when under the context window', () => {
    const modelMessages = [msg('a'), msg('b'), msg('c')];
    const { effectiveMessages } = buildTurnSystemPrompt({
      snapshot,
      displayName: null,
      userSettings: settings,
      resolvedModelId: 'google/gemini-2.5-flash',
      modelMessages,
    });
    expect(effectiveMessages).toBe(modelMessages);
  });

  it('truncates older messages when over the context window', () => {
    const huge = 'x'.repeat(500_000);
    const modelMessages: ModelMessage[] = [
      msg(huge),
      msg('recent 1'),
      msg('recent 2'),
      msg('recent 3'),
      msg('recent 4'),
    ];
    const { effectiveMessages } = buildTurnSystemPrompt({
      snapshot,
      displayName: null,
      userSettings: settings,
      resolvedModelId: 'openai/gpt-5.6-sol', // 128_000 token context
      modelMessages,
    });
    expect(effectiveMessages.length).toBeLessThan(modelMessages.length);
    expect(effectiveMessages[effectiveMessages.length - 1]?.content).toBe('recent 4');
  });
});
