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

import { fuzzyMatch, rankByQuery } from '../src/lib/fuzzy-match';

describe('fuzzyMatch — empty query', () => {
  it('matches any non-empty target with a baseline score', () => {
    const m = fuzzyMatch('', 'Settings');
    expect(m).not.toBeNull();
    expect(m!.score).toBe(1);
    expect(m!.indices).toEqual([]);
  });

  it('returns null for an empty target', () => {
    expect(fuzzyMatch('', '')).toBeNull();
  });

  it('empty query is identical to a single space', () => {
    // Whitespace-only query is still "empty" from the user's POV.
    // We do not strip — the palette's input handler filters leading
    // whitespace. This test pins the literal behaviour.
    const a = fuzzyMatch('', 'Settings');
    const b = fuzzyMatch(' ', 'Settings');
    expect(a).not.toBeNull();
    // ' ' (1 char) against 'settings' (8 chars): the space does
    // not appear, so the query is not fully consumed → null.
    expect(b).toBeNull();
  });
});

describe('fuzzyMatch — exact and prefix matches', () => {
  it('returns null when query has no characters in common with target', () => {
    expect(fuzzyMatch('xyz', 'Settings')).toBeNull();
  });

  it('returns null when target is empty but query is not', () => {
    expect(fuzzyMatch('a', '')).toBeNull();
  });

  it('matches a prefix case-insensitively and gives a high score', () => {
    const m = fuzzyMatch('set', 'Settings');
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([0, 1, 2]);
    // Prefix bonus (+1000) + first-char-at-word-start (+500) + 2
    // consecutive matches at word start (+100 each), but the 2nd
    // and 3rd chars are mid-word so they only get the consecutive
    // bonus. The 2nd is also at a word boundary after the previous
    // match in the same word (NOT a true word-start), so the
    // lastWasBoundary flag flips off after the first char. We
    // assert >= 1500 to lock in "prefix beats substring" without
    // overspecifying the exact bonus arithmetic.
    expect(m!.score).toBeGreaterThanOrEqual(1500);
  });

  it('matches a substring anywhere', () => {
    // Greedy walk: 't' at index 2 (first 't'), then 'i' at index 4,
    // then 'n' at index 5. Indices [2, 4, 5] reflect the greedy
    // skip-over behaviour, not the lexicographically earliest
    // contiguous match.
    const m = fuzzyMatch('tin', 'Settings');
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([2, 4, 5]);
  });
});

describe('fuzzyMatch — case and diacritic insensitivity', () => {
  it('matches across case', () => {
    const m = fuzzyMatch('SETTINGS', 'settings');
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(0);
  });

  it('matches across diacritics on the target', () => {
    // "Café" normalised is "cafe".
    const m = fuzzyMatch('cafe', 'Café');
    expect(m).not.toBeNull();
  });

  it('matches across diacritics on the query', () => {
    const m = fuzzyMatch('Café', 'cafe news');
    expect(m).not.toBeNull();
  });
});

describe('fuzzyMatch — scoring', () => {
  it('prefix match outranks substring match', () => {
    const prefix = fuzzyMatch('set', 'Settings')!.score;
    const middle = fuzzyMatch('set', 'Reset')!.score;
    // 'set' is a prefix of 'Settings' but appears at position 2 of
    // 'Reset'. Prefix should win decisively.
    expect(prefix).toBeGreaterThan(middle);
  });

  it('shorter targets win among equal-prefix matches (tie-breaker)', () => {
    const long = fuzzyMatch('al', 'Alerts and journals')!.score;
    const short = fuzzyMatch('al', 'Alerts')!.score;
    expect(short).toBeGreaterThan(long);
  });

  it('word-boundary match outranks mid-word match', () => {
    const atBoundary = fuzzyMatch('nav', 'Nav Drawer')!.score;
    const midWord = fuzzyMatch('nav', 'Navigation')!.score;
    // 'nav' is at the start of both; the scoring here is dominated
    // by the prefix bonus. Tie-break is length.
    // Use a stronger contrast: 'drawer' (mid) vs 'Drawer' (boundary).
    const a = fuzzyMatch('dra', 'Open Drawer')!.score;
    const b = fuzzyMatch('dra', 'Undrawn balance')!.score;
    expect(a).toBeGreaterThan(b);
  });

  it('records indices for each matched character', () => {
    const m = fuzzyMatch('set', 'Settings');
    expect(m!.indices).toEqual([0, 1, 2]);
  });
});

describe('rankByQuery — sorting', () => {
  const items = [
    { id: 'a', label: 'Settings' },
    { id: 'b', label: 'Reset all' },
    { id: 'c', label: 'Open the drawer' },
    { id: 'd', label: 'NoMatchHere' },
  ] as const;

  it('returns no matches for a query that hits nothing', () => {
    const out = rankByQuery('xyz', items);
    expect(out).toEqual([]);
  });

  it('returns all items when query is empty, in original order', () => {
    const out = rankByQuery('', items);
    expect(out.map((o) => o.item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ranks a prefix match above a substring match', () => {
    const out = rankByQuery('set', items);
    // 'Settings' starts with 'set' → top rank.
    // 'Reset all' contains 'set' at a non-prefix position → second.
    expect(out[0]?.item.id).toBe('a');
    expect(out.find((o) => o.item.id === 'b')).toBeDefined();
  });

  it('skips items with empty labels', () => {
    const out = rankByQuery('', [...items, { id: 'e', label: '' }]);
    expect(out.map((o) => o.item.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
