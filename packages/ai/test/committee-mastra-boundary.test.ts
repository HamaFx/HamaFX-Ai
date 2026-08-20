import { afterEach, describe, expect, it } from 'vitest';

import { shouldUseMastraCommitteeText } from '../src/tools/convene-committee';

afterEach(() => {
  delete process.env.ENABLE_MASTRA_TEXT;
});

describe('Mastra committee tool boundary', () => {
  it('uses Mastra for bounded no-tool personas', () => {
    process.env.ENABLE_MASTRA_TEXT = 'true';
    expect(shouldUseMastraCommitteeText()).toBe(true);
  });

  it('keeps tool-grounded personas on the tool-capable fallback path', () => {
    process.env.ENABLE_MASTRA_TEXT = 'true';
    expect(shouldUseMastraCommitteeText({ googleSearch: {} })).toBe(false);
  });
});
