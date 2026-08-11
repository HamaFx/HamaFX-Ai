// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { cleanNewsText } from '@/lib/clean-news-text';

describe('cleanNewsText', () => {
  it('decodes common entities and removes malformed tag fragments', () => {
    expect(cleanNewsText('Gold &amp; dollar <n><\\n> rally')).toBe('Gold & dollar rally');
  });

  it('normalizes literal and actual line breaks without exposing markup', () => {
    expect(cleanNewsText('CPI\\n<\n> beats\n expectations')).toBe('CPI beats expectations');
  });

  it('handles double-encoded entities and numeric entities', () => {
    expect(cleanNewsText('Markets &amp;lt;calm&amp;gt; &#39;today&#39;')).toBe(
      "Markets calm 'today'",
    );
  });

  it('does not interpret plain text as HTML', () => {
    expect(cleanNewsText('Use <3 risk and keep 2 < 3')).toBe('Use <3 risk and keep 2 < 3');
  });

  it('removes closing pseudo-tags and double-escaped line breaks', () => {
    expect(cleanNewsText('Gold</n>\\\\n rally')).toBe('Gold rally');
  });

  it('collapses provider control characters and whitespace', () => {
    expect(cleanNewsText('  Fed\tdecision\r\n  today  ')).toBe('Fed decision today');
  });
});
