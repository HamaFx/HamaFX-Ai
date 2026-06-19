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

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hamafx/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: vi.fn().mockResolvedValue([
            {
              date: '2026-05-28',
              realYieldPct: 2.1,
              breakevenInflationPct: 2.3,
              goldClose: 2350.0,
              divergenceScore: 1.8, // Premium z-score
              createdAt: new Date(),
            },
            {
              date: '2026-05-27',
              realYieldPct: 2.05,
              breakevenInflationPct: 2.28,
              goldClose: 2340.0,
              divergenceScore: 0.2, // Balanced z-score
              createdAt: new Date(),
            },
          ]),
        }),
      }),
    }),
  }),
  schema: {
    intermarketResonance: {
      date: 'date',
    },
  },
}));

import { type GetIntermarketResonanceOutput } from '@hamafx/shared';
import { getIntermarketResonanceTool } from '../src/tools/get-intermarket-resonance';
import { withToolContext } from '../src/tool-context';

describe('getIntermarketResonanceTool', () => {
  it('correctly maps Drizzle outputs to the standardized resonance schema', async () => {
    // Run within a mocked ToolContext scope to pass AsyncLocalStorage assertion
    const result = (await withToolContext(
      {
        threadId: '00000000-0000-0000-0000-000000000000',
        userId: 'test-user',
        env: {} as any,
        signal: null,
        budget: { spent: 0, max: 5 },
        userSettings: {} as any,
      },
      () => Promise.resolve(getIntermarketResonanceTool.execute!({ symbol: 'XAUUSD', days: 10 }, {} as any)),
    )) as GetIntermarketResonanceOutput;

    expect(result.symbol).toBe('XAUUSD');
    expect(result.days).toBe(10);
    expect(result.observations.length).toBe(2);
    
    // Test z-score assertions
    expect(result.currentDivergence).toBe(1.8);
    expect(result.currentRealYield).toBe(2.1);
    expect(result.currentBreakevenInflation).toBe(2.3);
    
    // Regimes z-score maps (> 1.5 SD maps to divergent_hedging)
    expect(result.regime).toBe('divergent_hedging');
    expect(result.narrative).toContain('HEDGING');
  });
});
