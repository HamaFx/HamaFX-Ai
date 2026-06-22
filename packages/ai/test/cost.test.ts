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

import { estimateCostUsd } from '../src/cost';

describe('estimateCostUsd', () => {
  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('openai/gpt-4.1', 0, 0)).toBe(0);
  });

  it('uses the listed gpt-4.1 rates', () => {
    // 1M input + 1M output → 5 + 15 = 20 USD per the table in cost.ts
    expect(estimateCostUsd('openai/gpt-4.1', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('falls back to the safety rate for unknown models', () => {
    // Same as gpt-4.1 baseline — conservative.
    expect(estimateCostUsd('does-not-exist/x', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });

  it('mini model is much cheaper', () => {
    const main = estimateCostUsd('openai/gpt-4.1', 100_000, 50_000);
    const mini = estimateCostUsd('openai/gpt-4.1-mini', 100_000, 50_000);
    expect(mini).toBeLessThan(main / 5);
  });

  it('prices Vertex-prefixed Gemini at the same rate as the gateway id', () => {
    // Regression: the agent streams with `google-vertex/...` ids by default,
    // but RATES is keyed by `google/...`. Without normalization this fell
    // through to the $5/$15 fallback — a ~10x overcharge against the budget.
    const vertex = estimateCostUsd('google-vertex/gemini-2.5-flash', 1_000_000, 1_000_000);
    const gateway = estimateCostUsd('google/gemini-2.5-flash', 1_000_000, 1_000_000);
    expect(vertex).toBeCloseTo(gateway, 6);
    // And explicitly NOT the $5/$15 fallback.
    expect(vertex).toBeLessThan(5);
  });

  it('prices bare BYOK Gemini id like the gateway id', () => {
    const bare = estimateCostUsd('gemini-2.5-pro', 1_000_000, 0);
    const gateway = estimateCostUsd('google/gemini-2.5-pro', 1_000_000, 0);
    expect(bare).toBeCloseTo(gateway, 6);
  });

  it('still falls back for genuinely unknown providers', () => {
    expect(estimateCostUsd('does-not-exist/x', 1_000_000, 1_000_000)).toBeCloseTo(20, 6);
  });
});
