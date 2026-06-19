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
import {
  BYOK_PROVIDERS,
  BYOK_PROVIDERS_LIST,
  defaultModelFor,
  getProvider,
} from '../src/byok-providers';
import { PROVIDER_IDS } from '@hamafx/shared/byok';

describe('BYOK_PROVIDERS', () => {
  it('contains every id from PROVIDER_IDS', () => {
    for (const id of PROVIDER_IDS) {
      expect(BYOK_PROVIDERS[id]).toBeDefined();
    }
  });

  it('every spec has all required fields', () => {
    for (const spec of BYOK_PROVIDERS_LIST) {
      expect(spec.id).toBeTruthy();
      expect(spec.displayName).toBeTruthy();
      expect(spec.familyName).toBeTruthy();
      expect(spec.keyHint).toBeTruthy();
      expect(spec.description).toBeTruthy();
      expect(['free', 'low', 'medium', 'high']).toContain(spec.pricingTier);
      expect(spec.defaultModels.fundamental).toBeTruthy();
      expect(spec.defaultModels.technical).toBeTruthy();
      expect(spec.defaultModels.summary).toBeTruthy();
      expect(typeof spec.factory).toBe('function');
    }
  });

  it('free-tier providers are tagged free', () => {
    const free = BYOK_PROVIDERS_LIST.filter((p) => p.pricingTier === 'free').map((p) => p.id);
    // We expect at least Google and Groq to be free.
    expect(free).toContain('google');
    expect(free).toContain('groq');
  });

  it('factory returns a function that builds a language model', () => {
    for (const spec of BYOK_PROVIDERS_LIST) {
      // We can't actually call the AI SDK without a valid key, but the
      // factory itself must accept a string and return a function.
      const builder = spec.factory('test-key-that-is-long-enough');
      expect(typeof builder).toBe('function');
      // Calling the builder with a model id should not throw synchronously
      // for the providers we wire (most SDKs defer auth errors to the
      // actual API call).
      expect(() => builder('test-model')).not.toThrow();
    }
  });
});

describe('getProvider', () => {
  it('returns the spec for known ids', () => {
    expect(getProvider('google').id).toBe('google');
    expect(getProvider('anthropic').id).toBe('anthropic');
  });

  it('throws for unknown ids', () => {
    expect(() => getProvider('not-a-provider' as never)).toThrow(/Unknown BYOK provider/);
  });
});

describe('defaultModelFor', () => {
  it('returns the right model id per provider/domain', () => {
    expect(defaultModelFor('google', 'fundamental')).toMatch(/gemini/);
    expect(defaultModelFor('anthropic', 'fundamental')).toMatch(/claude/);
    expect(defaultModelFor('openai', 'technical')).toMatch(/gpt/);
  });

  it('returns null for providers without an embedding model', () => {
    expect(defaultModelFor('anthropic', 'embedding')).toBeNull();
    expect(defaultModelFor('deepseek', 'embedding')).toBeNull();
  });

  it('returns null for providers without a vision model', () => {
    expect(defaultModelFor('deepseek', 'vision')).toBeNull();
  });

  it('returns null for unknown provider ids', () => {
    expect(defaultModelFor('not-real' as never, 'technical')).toBeNull();
  });
});

describe('BYOK_PROVIDERS_LIST', () => {
  it('has the same length as PROVIDER_IDS', () => {
    expect(BYOK_PROVIDERS_LIST.length).toBe(PROVIDER_IDS.length);
  });

  it('contains every id exactly once', () => {
    const seen = new Set<string>();
    for (const spec of BYOK_PROVIDERS_LIST) {
      expect(seen.has(spec.id)).toBe(false);
      seen.add(spec.id);
    }
    expect(seen.size).toBe(PROVIDER_IDS.length);
  });
});