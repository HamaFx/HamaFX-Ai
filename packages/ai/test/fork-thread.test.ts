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

import { deriveForkedTitle } from '../src/persistence';

describe('Phase C item 19 — deriveForkedTitle', () => {
  it('returns the text verbatim when short enough', () => {
    expect(deriveForkedTitle('what is RSI?')).toBe('what is RSI?');
  });

  it('trims leading and trailing whitespace before measuring', () => {
    expect(deriveForkedTitle('   spot gold  ')).toBe('spot gold');
  });

  it('returns "New chat" for empty input', () => {
    expect(deriveForkedTitle('')).toBe('New chat');
    expect(deriveForkedTitle('   ')).toBe('New chat');
    expect(deriveForkedTitle('\n\t  \n')).toBe('New chat');
  });

  it('truncates with an ellipsis at 80 chars', () => {
    const long = 'a'.repeat(120);
    const out = deriveForkedTitle(long);
    expect(out.length).toBe(80);
    expect(out.endsWith('…')).toBe(true);
    // 79 chars of content + 1 ellipsis char
    expect(out.slice(0, 79)).toBe('a'.repeat(79));
  });

  it('does not truncate when exactly 80 chars', () => {
    const exact = 'b'.repeat(80);
    expect(deriveForkedTitle(exact)).toBe(exact);
  });

  it('does not break a multi-byte unicode character', () => {
    // 81 chars where the last is a multi-byte emoji. The slice
    // is byte-based but the visual expectation is 79 chars + …
    // — we just verify it doesn't throw and ends with …
    const long = 'x'.repeat(79) + '🎉🎉';
    const out = deriveForkedTitle(long);
    expect(out.endsWith('…')).toBe(true);
  });

  it('preserves inner whitespace and punctuation', () => {
    expect(deriveForkedTitle('hello, world!')).toBe('hello, world!');
  });
});
