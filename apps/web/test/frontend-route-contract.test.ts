// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

const navSource = read('apps/web/src/components/layout/nav-drawer.tsx');
const settingsNavSource = read('apps/web/src/app/(app)/settings/_components/settings-nav.tsx');
const commandsSource = read('apps/web/src/lib/commands.ts');
const watchlistSource = read(
  'apps/web/src/app/(app)/dashboard/_components/widgets/watchlist-widget.tsx',
);
const technicalPartSource = read('apps/web/src/components/chat/parts/analyze-technical.tsx');
const visionPartSource = read('apps/web/src/components/chat/parts/analyze-chart-image.tsx');

// These are intentionally not advertised until their product pages exist.
describe('frontend route contracts', () => {
  it('does not advertise unfinished Signals or Track Record routes', () => {
    for (const source of [navSource, settingsNavSource, commandsSource]) {
      expect(source).not.toContain("'/signals'");
      expect(source).not.toContain("'/settings/track-record'");
    }
  });

  it('uses symbol-specific TradingView chart links', () => {
    expect(watchlistSource).not.toContain('href="/chart"');
    expect(watchlistSource).toContain('href={`/chart/${list[0] ?? \'XAUUSD\'}`}');
    expect(technicalPartSource).toContain('href={`/chart/${symbol}?tf=${reading.tf}`}');
    expect(visionPartSource).toContain('return `/chart/${output.symbol}?tf=${output.tf}`');
    expect(technicalPartSource).not.toContain('/chart/${symbol}/structure');
    expect(visionPartSource).not.toContain('/chart/${output.symbol}/structure');
  });

  it('keeps the PWA screenshots referenced by the manifest available', () => {
    expect(existsSync(resolve(root, 'apps/web/public/screenshots/chat.png'))).toBe(true);
    expect(existsSync(resolve(root, 'apps/web/public/screenshots/dashboard.png'))).toBe(true);
  });
});
