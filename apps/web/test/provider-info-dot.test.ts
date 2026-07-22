// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import {
  buildProviderAriaLabel,
  buildProviderTooltip,
} from '../src/components/ui/provider-info-dot';

const FULL = {
  id: 'anthropic',
  displayName: 'Anthropic (Claude)',
  familyName: 'Claude',
  keyHint: 'sk-ant-…',
  description: 'Claude Sonnet / Haiku — strong reasoning, slower.',
  pricingTier: 'medium' as const,
  bestFor: 'Deep reasoning',
  supports: { vision: true, embedding: false },
};

describe('Phase C item 16 — buildProviderTooltip', () => {
  it('joins bestFor and supports flags with a middot', () => {
    expect(buildProviderTooltip(FULL)).toBe(
      'Best for: Deep reasoning · Supports: Vision',
    );
  });

  it('lists supports in the documented order (Vision, Embeddings)', () => {
    const out = buildProviderTooltip({
      ...FULL,
      supports: { vision: true, embedding: true },
    });
    expect(out).toContain('Supports: Vision, Embeddings');
  });

  it('omits Supports entirely when no flags are set', () => {
    const out = buildProviderTooltip({
      ...FULL,
      supports: { vision: false, embedding: false },
    });
    expect(out).toBe('Best for: Deep reasoning');
    expect(out).not.toContain('Supports');
  });

  it('omits bestFor when undefined and falls back to description', () => {
    const out = buildProviderTooltip({
      ...FULL,
      bestFor: undefined,
    });
    expect(out).toBe('Supports: Vision');
  });

  it('falls back to description when both bestFor and supports are absent', () => {
    const out = buildProviderTooltip({
      ...FULL,
      bestFor: undefined,
      supports: { vision: false, embedding: false },
    });
    expect(out).toBe('Claude Sonnet / Haiku — strong reasoning, slower.');
  });

  it('falls back to description when the whole supports field is missing', () => {
    const out = buildProviderTooltip({
      id: 'x',
      displayName: 'X',
      familyName: 'X',
      keyHint: '…',
      description: 'Fallback description.',
      pricingTier: 'medium',
    });
    expect(out).toBe('Fallback description.');
  });
});

describe('Phase C item 16 — buildProviderAriaLabel', () => {
  it('replaces the middot separator with a period', () => {
    expect(buildProviderAriaLabel(FULL)).toBe(
      'Best for: Deep reasoning. Supports: Vision',
    );
  });

  it('returns the description alone when both are absent', () => {
    expect(
      buildProviderAriaLabel({
        id: 'x',
        displayName: 'X',
        familyName: 'X',
        keyHint: '…',
        description: 'Just a description.',
        pricingTier: 'low',
      }),
    ).toBe('Just a description.');
  });
});
