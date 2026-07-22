// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import {
  MAX_TEXT_CHARS,
  SOFT_LIMIT_CHARS,
  formatCharCount,
  getCharCountTone,
} from '../src/components/chat/composer-helpers';

describe('composer-helpers — getCharCountTone', () => {
  it('returns "normal" for an empty message', () => {
    expect(getCharCountTone(0)).toBe('normal');
  });

  it('returns "normal" just below the soft limit', () => {
    expect(getCharCountTone(SOFT_LIMIT_CHARS - 1)).toBe('normal');
  });

  it('switches to "warn" exactly at the soft limit', () => {
    // Boundary: at SOFT_LIMIT_CHARS the user is being warned they
    // are approaching the cap.
    expect(getCharCountTone(SOFT_LIMIT_CHARS)).toBe('warn');
  });

  it('stays "warn" anywhere between soft limit and max', () => {
    expect(getCharCountTone(SOFT_LIMIT_CHARS + 1)).toBe('warn');
    expect(getCharCountTone(MAX_TEXT_CHARS - 100)).toBe('warn');
    expect(getCharCountTone(MAX_TEXT_CHARS)).toBe('warn');
  });

  it('switches to "danger" strictly above the max', () => {
    // The textarea's maxLength prevents reaching this in practice,
    // but the paste clamp and IME composition can technically
    // produce a count > MAX_TEXT_CHARS for a single render.
    expect(getCharCountTone(MAX_TEXT_CHARS + 1)).toBe('danger');
    expect(getCharCountTone(MAX_TEXT_CHARS + 100)).toBe('danger');
  });

  it('handles negative counts defensively as "normal"', () => {
    // A negative count should never happen, but if some upstream
    // bug lets it through, default to the least alarming state
    // rather than throwing or showing red.
    expect(getCharCountTone(-1)).toBe('normal');
  });
});

describe('composer-helpers — formatCharCount', () => {
  it('renders "0 / 8000" initially', () => {
    expect(formatCharCount(0)).toBe('0 / 8000');
  });

  it('renders small counts without separators', () => {
    expect(formatCharCount(1234)).toBe('1,234 / 8000');
  });

  it('renders thousands with locale separators', () => {
    // 5-digit counts should pick up a comma in en-US locales.
    expect(formatCharCount(5_000)).toMatch(/^5,000 \/ 8000$/);
  });

  it('keeps the max identifier un-localised', () => {
    // The "/ 8000" tail must always read 8000 regardless of locale.
    const out = formatCharCount(1234);
    expect(out.endsWith('/ 8000')).toBe(true);
  });
});

describe('composer-helpers — threshold constants', () => {
  it('keeps SOFT_LIMIT_CHARS below MAX_TEXT_CHARS', () => {
    expect(SOFT_LIMIT_CHARS).toBeLessThan(MAX_TEXT_CHARS);
  });

  it('preserves the documented defaults (regression guard)', () => {
    // If anyone changes these constants, this test will fail and
    // force a deliberate update to the plan + UX_UPGRADE_PLAN.md.
    expect(MAX_TEXT_CHARS).toBe(8000);
    expect(SOFT_LIMIT_CHARS).toBe(7500);
  });
});
