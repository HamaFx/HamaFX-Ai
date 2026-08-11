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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

// Source-contract tests for the "tidy the little inconsistencies" pass:
// one relative-time formatter everywhere, and action buttons meeting the
// project's h-10 (40px) minimum instead of a scattered 36px h-9.

describe('UI consistency tidy', () => {
  it('journal rows use the shared relative-time formatter', () => {
    const src = read('apps/web/src/app/(app)/journal/_components/entry-list.tsx');
    expect(src).toContain("import { formatRelative } from '@/lib/format'");
    expect(src).not.toContain('function relative(');
  });

  it('removed the dead duplicate health-age formatter', () => {
    const src = read('apps/web/src/components/ui/health-tone.ts');
    expect(src).not.toContain('formatHealthAge');
  });

  it('thread-switcher bulk actions meet the h-10 minimum button height', () => {
    const src = read('apps/web/src/components/chat/_components/thread-switcher.tsx');
    expect(src).not.toContain('inline-flex h-9');
    expect(src).toContain('inline-flex h-10');
  });

  it('news and calendar toolbar chips match the h-10 segmented-control standard', () => {
    const news = read('apps/web/src/app/(app)/news/_components/news-toolbar.tsx');
    const calendar = read('apps/web/src/app/(app)/calendar/_components/calendar-toolbar.tsx');
    expect(news).not.toContain('inline-flex h-9');
    expect(calendar).not.toContain('inline-flex h-9');
  });

  it('fallback-chain Add button no longer overrides its sm height', () => {
    const src = read(
      'apps/web/src/app/(app)/settings/models/_components/fallback-chain-picker.tsx',
    );
    // size="sm" already provides h-10; the previous h-9 className overrode it.
    expect(src).toContain('size="sm"');
    expect(src).not.toContain('shrink-0 h-9');
    expect(src).toContain('className="shrink-0"');
  });
});
