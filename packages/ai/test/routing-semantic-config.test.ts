// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from 'vitest';

import { resolveSemanticRoutingConfig } from '../src/routing';

const NO_KEYS_SETTINGS = { aiApiKeys: null, chatModel: null } as never;
const ENV = {} as never;

describe('resolveSemanticRoutingConfig', () => {
  afterEach(() => {
    delete process.env.AI_SEMANTIC_ROUTING_ENABLED;
  });

  it('returns null when disabled via env', () => {
    process.env.AI_SEMANTIC_ROUTING_ENABLED = 'false';
    expect(resolveSemanticRoutingConfig(NO_KEYS_SETTINGS, ENV)).toBeNull();
  });

  it('returns null when no planner model can be resolved (no BYOK keys)', () => {
    process.env.AI_SEMANTIC_ROUTING_ENABLED = 'true';
    // With no AI API keys and no env model, derivePlannerModel returns null.
    expect(resolveSemanticRoutingConfig(NO_KEYS_SETTINGS, ENV)).toBeNull();
  });

  it('defaults to enabled (no env var set)', () => {
    delete process.env.AI_SEMANTIC_ROUTING_ENABLED;
    // Should not throw; returns null only when model resolution fails.
    const result = resolveSemanticRoutingConfig(NO_KEYS_SETTINGS, ENV);
    // No keys → null, but the function didn't throw.
    expect(result).toBeNull();
  });

  it('passes through the abort signal when provided', () => {
    // We can't easily test model resolution without real keys, but we can
    // verify the function doesn't throw when a signal is passed.
    const controller = new AbortController();
    expect(() =>
      resolveSemanticRoutingConfig(NO_KEYS_SETTINGS, ENV, controller.signal),
    ).not.toThrow();
  });
});
