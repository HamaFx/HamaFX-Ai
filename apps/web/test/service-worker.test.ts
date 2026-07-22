// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('service worker', () => {
  it('precaches the expected shell URLs', () => {
    const precache = JSON.parse(readFileSync('public/sw-precache.json', 'utf8')) as unknown[];
    expect(precache).toContain('/chat');
    expect(precache).toContain('/offline');
    expect(precache).toContain('/manifest.webmanifest');
  });

  it('declares bypass prefixes and cache-first strategies', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    expect(sw).toContain('BYPASS_PREFIXES');
    expect(sw).toContain("'/api/chat'");
    expect(sw).toContain('function cacheFirst');
    expect(sw).toContain('function handleNavigation');
  });
});
