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

import { describe, it, expect } from 'vitest';
import { MODE_COST_ESTIMATE, AGENT_TIMEOUTS, AGENT_MODEL_TIER } from '../../src/multi-agent/types';

describe('budget — MODE_COST_ESTIMATE', () => {
  it('has estimates for all resolved modes', () => {
    expect(MODE_COST_ESTIMATE.single).toBeGreaterThan(0);
    expect(MODE_COST_ESTIMATE.quick).toBeGreaterThan(MODE_COST_ESTIMATE.single);
    expect(MODE_COST_ESTIMATE.standard).toBeGreaterThan(MODE_COST_ESTIMATE.quick);
    expect(MODE_COST_ESTIMATE.full).toBeGreaterThan(MODE_COST_ESTIMATE.standard);
  });

  it('full mode is ~4× single mode', () => {
    const ratio = MODE_COST_ESTIMATE.full / MODE_COST_ESTIMATE.single;
    expect(ratio).toBeCloseTo(4, 0);
  });
});

describe('budget — AGENT_TIMEOUTS', () => {
  it('has timeouts for all agents', () => {
    expect(AGENT_TIMEOUTS.technical).toBe(15_000);
    expect(AGENT_TIMEOUTS.fundamental).toBe(15_000);
    expect(AGENT_TIMEOUTS.risk).toBe(15_000);
    expect(AGENT_TIMEOUTS.sentiment).toBe(10_000);
    expect(AGENT_TIMEOUTS.decision).toBe(30_000);
  });

  it('decision agent has the longest timeout', () => {
    const maxTimeout = Math.max(...Object.values(AGENT_TIMEOUTS));
    expect(maxTimeout).toBe(AGENT_TIMEOUTS.decision);
  });
});

describe('budget — AGENT_MODEL_TIER', () => {
  it('maps technical to fast tier', () => {
    expect(AGENT_MODEL_TIER.technical).toBe('fast');
  });

  it('maps fundamental and risk to mid tier', () => {
    expect(AGENT_MODEL_TIER.fundamental).toBe('mid');
    expect(AGENT_MODEL_TIER.risk).toBe('mid');
  });

  it('maps decision to strong tier', () => {
    expect(AGENT_MODEL_TIER.decision).toBe('strong');
  });

  it('maps sentiment to fast tier', () => {
    expect(AGENT_MODEL_TIER.sentiment).toBe('fast');
  });
});