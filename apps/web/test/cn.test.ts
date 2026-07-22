// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { cn } from '../src/lib/cn';

describe('cn — basic class merging', () => {
  it('returns a single class unchanged', () => {
    expect(cn('px-4')).toBe('px-4');
  });

  it('joins multiple classes with a space', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('handles conditional classes via ternary', () => {
    expect(cn('base', true && 'visible', false && 'hidden')).toBe('base visible');
  });
});

describe('cn — clsx features', () => {
  it('handles object arguments', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo');
  });

  it('handles array arguments', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('filters out falsy values', () => {
    expect(cn('a', false, null, undefined, 0, 'b')).toBe('a b');
  });

  it('handles mixed objects and strings', () => {
    expect(cn('static', { conditional: true, hidden: false })).toBe('static conditional');
  });

  it('handles nested objects (value used as truthy check)', () => {
    expect(cn({ a: true, b: { c: true } })).toBe('a b');
  });
});

describe('cn — tailwind-merge conflict resolution', () => {
  it('resolves padding conflicts (last wins)', () => {
    expect(cn('px-4', 'px-8')).toBe('px-8');
  });

  it('resolves margin conflicts', () => {
    expect(cn('m-2', 'm-4')).toBe('m-4');
  });

  it('keeps non-conflicting classes from both sides', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
  });

  it('resolves conflicting utility in opposite order', () => {
    expect(cn('px-8', 'px-4')).toBe('px-4');
  });

  it('resolves arbitrary value conflicts', () => {
    expect(cn('p-[10px]', 'p-4')).toBe('p-4');
  });

  it('merges non-conflicting arbitrary values', () => {
    expect(cn('p-[10px]', 'm-4')).toBe('p-[10px] m-4');
  });

  it('resolves color shade conflicts', () => {
    expect(cn('text-red-500', 'text-blue-700')).toBe('text-blue-700');
  });

  it('resolves flex direction conflicts', () => {
    expect(cn('flex-row', 'flex-col')).toBe('flex-col');
  });

  it('resolves width conflicts', () => {
    expect(cn('w-full', 'w-1/2')).toBe('w-1/2');
  });

  it('resolves display conflicts', () => {
    expect(cn('block', 'inline-flex')).toBe('inline-flex');
  });
});

describe('cn — edge cases', () => {
  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns empty string for all falsy values', () => {
    expect(cn(false, null, undefined, '')).toBe('');
  });

  it('handles deeply nested arrays', () => {
    expect(cn(['a', ['b', ['c']]])).toBe('a b c');
  });
});
