import { describe, expect, it } from 'vitest';
import { matchesPattern } from '../scripts/bundle-size-guard.mjs';

describe('bundle-size-guard matcher', () => {
  it('matches exact paths', () => {
    expect(matchesPattern('main-abc.js', 'main-abc.js')).toBe(true);
    expect(matchesPattern('main-abc.js', 'main-def.js')).toBe(false);
  });

  it('matches single-segment wildcards', () => {
    expect(matchesPattern('app/dashboard-abc.js', 'app/*.js')).toBe(true);
    expect(matchesPattern('app/nested/page-abc.js', 'app/*.js')).toBe(false);
  });

  it('matches zero or more segments with **', () => {
    expect(matchesPattern('foo.js', '**/*.js')).toBe(true);
    expect(matchesPattern('a/foo.js', '**/*.js')).toBe(true);
    expect(matchesPattern('a/b/c/foo.js', '**/*.js')).toBe(true);
    expect(matchesPattern('a/b/c/foo.css', '**/*.js')).toBe(false);
  });

  it('matches chat route patterns', () => {
    expect(matchesPattern('app/(app)/chat/page-abc.js', 'app/(app)/chat/**/*.js')).toBe(true);
    expect(matchesPattern('app/(app)/chat/[threadId]/page-abc.js', 'app/(app)/chat/**/*.js')).toBe(true);
    expect(matchesPattern('app/(app)/settings/page-abc.js', 'app/(app)/chat/**/*.js')).toBe(false);
  });

  it('matches nested ** patterns', () => {
    expect(matchesPattern('app/a/b/c.js', 'app/**/*.js')).toBe(true);
    expect(matchesPattern('app/a.js', 'app/**/*.js')).toBe(true);
    expect(matchesPattern('pages/a.js', 'app/**/*.js')).toBe(false);
  });

  it('does not over-match extra trailing segments', () => {
    expect(matchesPattern('app/page.js', 'app/*.js')).toBe(true);
    expect(matchesPattern('app/foo/page.js', 'app/*.js')).toBe(false);
  });
});
