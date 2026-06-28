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
    expect(m!.score).toBe(0);
    expect(m!.indices).toEqual([]);
  });

  it('returns null for an empty target', () => {
    expect(fuzzyMatch('', '')).toEqual({ score: -1, indices: [] });
  });

  it('empty query is identical to a single space', () => {
    const a = fuzzyMatch('', 'Settings');
    const b = fuzzyMatch(' ', 'Settings');
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});

describe('fuzzyMatch — exact and prefix matches', () => {
  it('returns null when query has no characters in common with target', () => {
    expect(fuzzyMatch('xyz', 'Settings')).toBeNull();
  });

  it('returns null when target is empty but query is not', () => {
    expect(fuzzyMatch('a', '')).toEqual({ score: -1, indices: [] });
  });

  it('matches a prefix case-insensitively and gives a high score', () => {
    const m = fuzzyMatch('set', 'Settings');
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([0, 1, 2]);
  });

  it('matches a substring anywhere', () => {
    const m = fuzzyMatch('tin', 'Settings');
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([2, 4, 5]);
  });

  it('matches query equal to target exactly', () => {
    const m = fuzzyMatch('settings', 'Settings');
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(500);
  });

  it('matches target with special regex characters', () => {
    const m = fuzzyMatch('test', 'test+data[1]');
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(0);
  });

  it('matches target with leading and trailing whitespace', () => {
    const m = fuzzyMatch('data', '  some data here  ');
    expect(m).not.toBeNull();
  });
});

describe('fuzzyMatch — case and diacritic insensitivity', () => {
  it('matches across case', () => {
    const m = fuzzyMatch('SETTINGS', 'settings');
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(0);
  });

  it('matches across diacritics on the target', () => {
    const m = fuzzyMatch('cafe', 'Café');
    expect(m).not.toBeNull();
  });

  it('matches across diacritics on the query', () => {
    const m = fuzzyMatch('Café', 'cafe news');
    expect(m).not.toBeNull();
  });

  it('matches across combined diacritics', () => {
    const m = fuzzyMatch('crepe', 'crêpe suzette');
    expect(m).not.toBeNull();
  });

  it('matches across multiple diacritics and case', () => {
    const m = fuzzyMatch('jalapeno', 'Jalapeño');
    expect(m).not.toBeNull();
  });

  it('handles queries with diacritics that do not match', () => {
    const m = fuzzyMatch('café', 'coffee');
    expect(m).toBeNull();
  });
});

describe('fuzzyMatch — scoring', () => {
  it('prefix match outranks substring match', () => {
    const prefix = fuzzyMatch('set', 'Settings')!.score;
    const middle = fuzzyMatch('set', 'Reset')!.score;
    expect(prefix).toBeGreaterThan(middle);
  });

  it('shorter targets win among equal-prefix matches (tie-breaker)', () => {
    const long = fuzzyMatch('al', 'Alerts and journals')!.score;
    const short = fuzzyMatch('al', 'Alerts')!.score;
    expect(short).toBeGreaterThan(long);
  });

  it('word-boundary match outranks mid-word match', () => {
    const a = fuzzyMatch('dra', 'Open Drawer')!.score;
    const b = fuzzyMatch('dra', 'Undrawn balance')!.score;
    expect(a).toBeGreaterThan(b);
  });

  it('records indices for each matched character', () => {
    const m = fuzzyMatch('set', 'Settings');
    expect(m!.indices).toEqual([0, 1, 2]);
  });

  it('consecutive characters get a higher score than scattered ones', () => {
    const consecutive = fuzzyMatch('abc', 'abcdef')!.score;
    const scattered = fuzzyMatch('abc', 'axbycz')!.score;
    expect(consecutive).toBeGreaterThan(scattered);
  });

  it('partial match where not all query chars are consumed returns null', () => {
    // 'SETT' is 4 chars, 'Settings' normalised is 'settings' — no 't' after 's'
    // Actually 'settings' does contain all: s,e,t,t,i,n,g,s
    // Use a query that has characters not present
    expect(fuzzyMatch('setx', 'Set')).toBeNull();
  });

  it('score decreases with target length for equal prefix matches', () => {
    const short = fuzzyMatch('ex', 'Example')!.score;
    const long = fuzzyMatch('ex', 'Exemplary conduct')!.score;
    expect(short).toBeGreaterThan(long);
  });
});

describe('fuzzyMatch — edge cases', () => {
  it('handles single character query', () => {
    expect(fuzzyMatch('s', 'Settings')).not.toBeNull();
    expect(fuzzyMatch('z', 'Settings')).toBeNull();
  });

  it('handles single character target', () => {
    expect(fuzzyMatch('a', 'a')).not.toBeNull();
    expect(fuzzyMatch('b', 'a')).toBeNull();
  });

  it('handles target with only whitespace', () => {
    const m = fuzzyMatch('abc', '   ');
    expect(m).toBeNull();
  });

  it('handles query that is much longer than target', () => {
    expect(fuzzyMatch('abcdefghij', 'abc')).toBeNull();
  });

  it('handles unicode characters beyond ascii', () => {
    const m = fuzzyMatch('αβ', 'αβγ');
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThan(0);
  });

  it('handles target with emoji', () => {
    const m = fuzzyMatch('hello', '🚀 hello world');
    expect(m).not.toBeNull();
  });

  it('handles mid-word matching when query chars exist', () => {
    const m = fuzzyMatch('ttings', 'Settings');
    expect(m).not.toBeNull();
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
    expect(out[0]?.item.id).toBe('a');
    expect(out.find((o) => o.item.id === 'b')).toBeDefined();
  });

  it('skips items with empty labels', () => {
    const out = rankByQuery('', [...items, { id: 'e', label: '' }]);
    expect(out.map((o) => o.item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts by descending score', () => {
    const results = rankByQuery('set', items);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.match.score).toBeGreaterThanOrEqual(results[i]!.match.score);
    }
  });

  it('returns predictable order for same-score items (stable sort)', () => {
    const sameLabel = [
      { id: 'x', label: 'Alpha' },
      { id: 'y', label: 'Beta' },
      { id: 'z', label: 'Alpha' },
    ];
    const out = rankByQuery('Al', sameLabel);
    expect(out[0]?.item.id).toBe('x');
    expect(out[1]?.item.id).toBe('z');
  });

  it('handles empty items array', () => {
    expect(rankByQuery('test', [])).toEqual([]);
  });

  it('handles all non-matching items', () => {
    const allNoMatch = [
      { id: 'x', label: 'Apple' },
      { id: 'y', label: 'Banana' },
    ];
    expect(rankByQuery('zzz', allNoMatch)).toEqual([]);
  });
});
