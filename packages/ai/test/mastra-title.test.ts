import { describe, expect, it } from 'vitest';

import { cleanTitleForPersistence, deterministicFallbackTitle } from '@kestrel/ai/mastra';

describe('deterministicFallbackTitle', () => {
  it('returns the trimmed first-user text when under the limit', () => {
    expect(deterministicFallbackTitle('  Is gold breaking out?  ')).toBe('Is gold breaking out?');
  });

  it('clips long text to 60 codepoints with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const title = deterministicFallbackTitle(long);
    expect(Array.from(title).length).toBe(61); // 60 + ellipsis
    expect(title.endsWith('…')).toBe(true);
  });

  it('is codepoint-safe (emoji are not split)', () => {
    const title = deterministicFallbackTitle('🚀'.repeat(70));
    expect(Array.from(title).length).toBe(61); // 60 + ellipsis
    expect(title.slice(-1)).toBe('…');
  });

  it('handles empty input without throwing', () => {
    expect(deterministicFallbackTitle('   ')).toBe('');
  });
});

describe('cleanTitleForPersistence', () => {
  it('strips a single pair of surrounding quotes', () => {
    expect(cleanTitleForPersistence('"Gold breakout watch"')).toBe('Gold breakout watch');
    expect(cleanTitleForPersistence("'Gold breakout watch'")).toBe('Gold breakout watch');
    expect(cleanTitleForPersistence('`Gold breakout watch`')).toBe('Gold breakout watch');
  });

  it('leaves internal quotes intact', () => {
    expect(cleanTitleForPersistence('The "real" gold picture')).toBe('The "real" gold picture');
  });

  it('trims and clips to the codepoint limit', () => {
    expect(cleanTitleForPersistence('  Hello world  ')).toBe('Hello world');
    expect(Array.from(cleanTitleForPersistence('y'.repeat(100))).length).toBe(61);
  });
});
