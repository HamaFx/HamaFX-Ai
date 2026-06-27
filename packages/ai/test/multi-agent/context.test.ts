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

import { describe, it, expect } from 'vitest';
import { extractUserMessageText } from '../../src/multi-agent/context';
import type { UIMessage } from 'ai';

describe('context — extractUserMessageText', () => {
  it('extracts text from parts array', () => {
    const msg = {
      id: '1',
      role: 'user' as const,
      content: '',
      parts: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ],
    } as unknown as UIMessage;
    expect(extractUserMessageText(msg)).toBe('Hello \nworld');
  });

  it('extracts text from content when no parts', () => {
    const msg = {
      id: '2',
      role: 'user' as const,
      content: 'Fallback content',
      parts: [],
    } as unknown as UIMessage;
    expect(extractUserMessageText(msg)).toBe('Fallback content');
  });

  it('handles empty parts array', () => {
    const msg = {
      id: '3',
      role: 'user' as const,
      content: 'from content',
      parts: [],
    } as unknown as UIMessage;
    expect(extractUserMessageText(msg)).toBe('from content');
  });

  it('filters non-text parts', () => {
    const msg = {
      id: '4',
      role: 'user' as const,
      content: '',
      parts: [
        { type: 'text', text: 'Real text' },
        { type: 'tool-call', toolCallId: 'x', toolName: 'test', args: {} },
        { type: 'file', mediaType: 'image/png', url: 'x' },
      ],
    } as unknown as UIMessage;
    expect(extractUserMessageText(msg)).toBe('Real text');
  });
});